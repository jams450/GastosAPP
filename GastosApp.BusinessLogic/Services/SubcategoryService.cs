using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class SubcategoryService : ISubcategoryService
    {
        private readonly IRepository _repository;

        public SubcategoryService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<Subcategory?> GetByIdAsync(int id, int userId)
        {
            return await _repository.Get<Subcategory>(s => s.SubcategoryId == id && (s.UserId == userId || s.UserId == null))
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Subcategory>> GetByUserIdAsync(int userId, bool onlyActive = false)
        {
            return await _repository.Get<Subcategory>(s => (s.UserId == userId || s.UserId == null) && (!onlyActive || s.Active))
                .OrderBy(s => s.Name)
                .ToListAsync();
        }

        public async Task<IEnumerable<Subcategory>> GetByCategoryIdAsync(int userId, int categoryId, bool onlyActive = false)
        {
            return await _repository.Get<Subcategory>(s =>
                    s.CategoryId == categoryId &&
                    (s.UserId == userId || s.UserId == null) &&
                    (!onlyActive || s.Active))
                .OrderBy(s => s.Name)
                .ToListAsync();
        }

        public async Task<Subcategory> CreateAsync(Subcategory subcategory, int userId)
        {
            subcategory.UserId = userId;
            subcategory.Name = subcategory.Name.Trim();
            subcategory.NormalizedName = Normalize(subcategory.Name);
            subcategory.Active = true;
            subcategory.Created = DateTime.UtcNow;
            return await _repository.Save(subcategory);
        }

        public async Task<Subcategory?> UpdateAsync(int id, Subcategory subcategory, int userId)
        {
            var existing = await _repository.GetTrack<Subcategory>()
                .FirstOrDefaultAsync(s => s.SubcategoryId == id && (s.UserId == userId || s.UserId == null));

            if (existing == null)
            {
                return null;
            }

            existing.Name = subcategory.Name.Trim();
            existing.NormalizedName = Normalize(existing.Name);
            existing.CategoryId = subcategory.CategoryId;
            existing.Active = subcategory.Active;
            existing.Updated = DateTime.UtcNow;
            await _repository.SaveChangesAsync();
            return existing;
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, int userId, bool active)
        {
            var existing = await _repository.GetTrack<Subcategory>()
                .FirstOrDefaultAsync(s => s.SubcategoryId == id && (s.UserId == userId || s.UserId == null));

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
