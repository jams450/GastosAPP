using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class MerchantService : IMerchantService
    {
        private readonly IRepository _repository;

        public MerchantService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<Merchant?> GetByIdAsync(int id, int userId)
        {
            return await _repository.Get<Merchant>(m => m.MerchantId == id && (m.UserId == userId || m.UserId == null))
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Merchant>> GetByUserIdAsync(int userId, bool onlyActive = false)
        {
            return await _repository.Get<Merchant>(m => (m.UserId == userId || m.UserId == null) && (!onlyActive || m.Active))
                .OrderBy(m => m.Name)
                .ToListAsync();
        }

        public async Task<Merchant> CreateAsync(Merchant merchant, int userId)
        {
            merchant.UserId = userId;
            merchant.Name = merchant.Name.Trim();
            merchant.NormalizedName = Normalize(merchant.Name);
            merchant.Active = true;
            merchant.Created = DateTime.UtcNow;
            return await _repository.Save(merchant);
        }

        public async Task<Merchant?> UpdateAsync(int id, Merchant merchant, int userId)
        {
            var existing = await _repository.GetTrack<Merchant>()
                .FirstOrDefaultAsync(m => m.MerchantId == id && (m.UserId == userId || m.UserId == null));

            if (existing == null)
            {
                return null;
            }

            existing.Name = merchant.Name.Trim();
            existing.NormalizedName = Normalize(existing.Name);
            existing.Active = merchant.Active;
            existing.Updated = DateTime.UtcNow;
            await _repository.SaveChangesAsync();
            return existing;
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, int userId, bool active)
        {
            var existing = await _repository.GetTrack<Merchant>()
                .FirstOrDefaultAsync(m => m.MerchantId == id && (m.UserId == userId || m.UserId == null));

            if (existing == null)
            {
                return false;
            }

            existing.Active = active;
            existing.Updated = DateTime.UtcNow;
            await _repository.SaveChangesAsync();
            return true;
        }

        private static string Normalize(string value)
            => string.Join(' ', value.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}
