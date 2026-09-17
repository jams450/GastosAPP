using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class MerchantService : IMerchantService
    {
        private const int MaxNameLength = 120;
        private readonly IRepository _repository;

        public MerchantService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<Merchant?> GetByIdAsync(int id, int userId)
        {
            return await BuildReadableScope(userId)
                .Where(m => m.MerchantId == id)
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Merchant>> GetByUserIdAsync(int userId, bool onlyActive = false)
        {
            return await BuildReadableScope(userId)
                .Where(m => !onlyActive || m.Active)
                .OrderBy(m => m.Name)
                .ThenBy(m => m.MerchantId)
                .ToListAsync();
        }

        public async Task<Merchant> CreateAsync(Merchant merchant, int userId)
        {
            var (cleanName, normalizedName) = NormalizeNameOrThrow(merchant.Name);
            merchant.UserId = userId;
            merchant.Name = cleanName;
            merchant.NormalizedName = normalizedName;
            merchant.Active = true;

            try
            {
                return await _repository.Save(merchant);
            }
            catch (DbUpdateException ex)
            {
                throw new ArgumentException("A merchant with same name already exists for this user", ex);
            }
        }

        public async Task<Merchant?> UpdateAsync(int id, Merchant merchant, int userId)
        {
            var existing = await BuildWritableScope(userId)
                .FirstOrDefaultAsync(m => m.MerchantId == id);

            if (existing == null)
            {
                return null;
            }

            var (cleanName, normalizedName) = NormalizeNameOrThrow(merchant.Name);
            existing.Name = cleanName;
            existing.NormalizedName = normalizedName;

            try
            {
                await _repository.SaveChangesAsync();
                return existing;
            }
            catch (DbUpdateException ex)
            {
                throw new ArgumentException("A merchant with same name already exists for this user", ex);
            }
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, int userId, bool active)
        {
            var existing = await BuildWritableScope(userId)
                .FirstOrDefaultAsync(m => m.MerchantId == id);

            if (existing == null)
            {
                return false;
            }

            existing.Active = active;
            await _repository.SaveChangesAsync();
            return true;
        }

        private IQueryable<Merchant> BuildReadableScope(int userId)
        {
            return _repository.Get<Merchant>(m => m.UserId == userId || m.UserId == null);
        }

        private IQueryable<Merchant> BuildWritableScope(int userId)
        {
            return _repository.GetTrack<Merchant>().Where(m => m.UserId == userId);
        }

        private static (string Name, string NormalizedName) NormalizeNameOrThrow(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new ArgumentException("Merchant name is required");
            }

            var cleanedName = value.Trim();
            if (cleanedName.Length > MaxNameLength)
            {
                throw new ArgumentException($"Merchant name cannot exceed {MaxNameLength} characters");
            }

            return (cleanedName, Normalize(cleanedName));
        }

        private static string Normalize(string value)
            => string.Join(' ', value.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}
