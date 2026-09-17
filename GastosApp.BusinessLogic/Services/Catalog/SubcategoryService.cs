using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class SubcategoryService : ISubcategoryService
    {
        private const int MaxNameLength = 100;
        private readonly IRepository _repository;

        public SubcategoryService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<Subcategory?> GetByIdAsync(int id, int userId)
        {
            return await BuildReadableScope(userId)
                .Where(s => s.SubcategoryId == id)
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Subcategory>> GetByUserIdAsync(int userId, bool onlyActive = false)
        {
            return await BuildReadableScope(userId)
                .Where(s => !onlyActive || s.Active)
                .OrderBy(s => s.Name)
                .ThenBy(s => s.SubcategoryId)
                .ToListAsync();
        }

        public async Task<IEnumerable<Subcategory>> GetByCategoryIdAsync(int userId, int categoryId, bool onlyActive = false)
        {
            return await BuildReadableScope(userId)
                .Where(s => s.CategoryId == categoryId && (!onlyActive || s.Active))
                .OrderBy(s => s.Name)
                .ThenBy(s => s.SubcategoryId)
                .ToListAsync();
        }

        public async Task<Subcategory> CreateAsync(Subcategory subcategory, int userId)
        {
            var (cleanName, normalizedName) = NormalizeNameOrThrow(subcategory.Name);
            var isCategoryAccessible = await IsCategoryAccessibleForUserAsync(userId, subcategory.CategoryId);
            if (!isCategoryAccessible)
            {
                throw new ArgumentException("Invalid category for current user");
            }

            subcategory.UserId = userId;
            subcategory.Name = cleanName;
            subcategory.NormalizedName = normalizedName;
            subcategory.Active = true;

            try
            {
                return await _repository.Save(subcategory);
            }
            catch (DbUpdateException ex)
            {
                throw new ArgumentException("A subcategory with same name already exists for this category", ex);
            }
        }

        public async Task<Subcategory?> UpdateAsync(int id, Subcategory subcategory, int userId)
        {
            var existing = await BuildWritableScope(userId)
                .FirstOrDefaultAsync(s => s.SubcategoryId == id);

            if (existing == null)
            {
                return null;
            }

            var isCategoryAccessible = await IsCategoryAccessibleForUserAsync(userId, subcategory.CategoryId);
            if (!isCategoryAccessible)
            {
                throw new ArgumentException("Invalid category for current user");
            }

            var (cleanName, normalizedName) = NormalizeNameOrThrow(subcategory.Name);
            existing.Name = cleanName;
            existing.NormalizedName = normalizedName;
            existing.CategoryId = subcategory.CategoryId;

            try
            {
                await _repository.SaveChangesAsync();
                return existing;
            }
            catch (DbUpdateException ex)
            {
                throw new ArgumentException("A subcategory with same name already exists for this category", ex);
            }
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, int userId, bool active)
        {
            var existing = await BuildWritableScope(userId)
                .FirstOrDefaultAsync(s => s.SubcategoryId == id);

            if (existing == null)
            {
                return false;
            }

            existing.Active = active;
            await _repository.SaveChangesAsync();
            return true;
        }

        private IQueryable<Subcategory> BuildReadableScope(int userId)
        {
            return _repository.Get<Subcategory>(s => s.UserId == userId || s.UserId == null);
        }

        private IQueryable<Subcategory> BuildWritableScope(int userId)
        {
            return _repository.GetTrack<Subcategory>().Where(s => s.UserId == userId);
        }

        private async Task<bool> IsCategoryAccessibleForUserAsync(int userId, int categoryId)
        {
            return await _repository.Get<Category>(c => c.CategoryId == categoryId && (c.UserId == userId || c.UserId == null))
                .AnyAsync();
        }

        private static (string Name, string NormalizedName) NormalizeNameOrThrow(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new ArgumentException("Subcategory name is required");
            }

            var cleanedName = value.Trim();
            if (cleanedName.Length > MaxNameLength)
            {
                throw new ArgumentException($"Subcategory name cannot exceed {MaxNameLength} characters");
            }

            return (cleanedName, Normalize(cleanedName));
        }

        private static string Normalize(string value)
            => string.Join(' ', value.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}
