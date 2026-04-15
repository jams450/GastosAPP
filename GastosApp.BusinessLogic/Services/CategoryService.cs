using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace GastosApp.BusinessLogic.Services
{
    public class CategoryService : ICategoryService
    {
        private readonly IRepository _repository;

        public CategoryService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<Category?> GetByIdAsync(int id)
        {
            return await _repository.GetByIdAsync<Category>(id);
        }

        public async Task<Category?> GetByIdWithTagsAsync(int id, int userId)
        {
            return await _repository.Get<Category>(c => c.CategoryId == id && (c.UserId == userId || c.UserId == null))
                .Include(c => c.CategoryTags)
                .ThenInclude(ct => ct.Tag)
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Category>> GetAllByUserIdAsync(int userId)
        {
            return await _repository.Get<Category>(c => c.UserId == userId || c.UserId == null)
                .Include(c => c.CategoryTags)
                .ThenInclude(ct => ct.Tag)
                .ToListAsync();
        }

        public async Task<IEnumerable<Category>> GetAllActiveByUserIdAsync(int userId)
        {
            return await _repository.Get<Category>(c => (c.UserId == userId || c.UserId == null) && c.Active)
                .Include(c => c.CategoryTags)
                .ThenInclude(ct => ct.Tag)
                .ToListAsync();
        }

        public async Task<IEnumerable<Category>> GetByTypeAsync(int userId, string type)
        {
            return await _repository.Get<Category>(c => 
                (c.UserId == userId || c.UserId == null) && 
                c.Type.ToLower() == type.ToLower() && 
                c.Active)
                .Include(c => c.CategoryTags)
                .ThenInclude(ct => ct.Tag)
                .ToListAsync();
        }

        public async Task<Category> CreateAsync(Category category)
        {
            category.Active = true;
            category.Created = DateTime.UtcNow;
            return await _repository.Save<Category>(category);
        }

        public async Task<Category> CreateWithTagsAsync(Category category, int userId, IEnumerable<string>? tags)
        {
            category.UserId = userId;
            category.Created = DateTime.UtcNow;

            var createdCategory = await _repository.Save(category);
            await SyncTagsAsync(createdCategory, userId, tags);

            return (await GetByIdWithTagsAsync(createdCategory.CategoryId, userId)) ?? createdCategory;
        }

        public async Task<Category?> UpdateAsync(int id, Category category)
        {
            var existing = await _repository.GetByIdAsync<Category>(id);
            if (existing == null) return null;

            category.CategoryId = id;
            category.Updated = DateTime.UtcNow;
            return await _repository.SaveUpdate<Category>(id, category);
        }

        public async Task<Category?> UpdateWithTagsAsync(int id, Category category, int userId, IEnumerable<string>? tags)
        {
            var existing = await _repository.GetTrack<Category>()
                .Include(c => c.CategoryTags)
                .ThenInclude(ct => ct.Tag)
                .FirstOrDefaultAsync(c => c.CategoryId == id && (c.UserId == userId || c.UserId == null));

            if (existing == null)
            {
                return null;
            }

            existing.Name = category.Name;
            existing.Color = category.Color;
            existing.Type = category.Type;
            existing.Active = category.Active;
            existing.Updated = DateTime.UtcNow;

            await _repository.SaveChangesAsync();
            await SyncTagsAsync(existing, userId, tags);

            return await GetByIdWithTagsAsync(id, userId);
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var result = await _repository.DeleteModel<Category>(id);
            return result > 0;
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, bool active)
        {
            return await _repository.UpdateFieldAsync<Category>(id, "Active", active);
        }

        private async Task SyncTagsAsync(Category category, int userId, IEnumerable<string>? tags)
        {
            var normalizedTags = NormalizeTags(tags);

            var existingRelations = await _repository.Get<CategoryTag>(ct => ct.CategoryId == category.CategoryId)
                .Include(ct => ct.Tag)
                .ToListAsync();

            var existingByNormalized = existingRelations
                .Where(ct => ct.Tag != null)
                .ToDictionary(ct => ct.Tag.NormalizedName, ct => ct, StringComparer.OrdinalIgnoreCase);

            var toKeep = new HashSet<string>(normalizedTags, StringComparer.OrdinalIgnoreCase);

            foreach (var relation in existingRelations.Where(r => r.Tag != null && !toKeep.Contains(r.Tag.NormalizedName)))
            {
                await _repository.RemoveAsync(relation);
            }

            foreach (var normalized in normalizedTags)
            {
                if (existingByNormalized.ContainsKey(normalized))
                {
                    continue;
                }

                var tag = await _repository.Get<Tag>(t => (t.UserId == userId || t.UserId == null) && t.NormalizedName == normalized)
                    .FirstOrDefaultAsync();

                if (tag == null)
                {
                    tag = new Tag
                    {
                        UserId = userId,
                        Name = normalized,
                        NormalizedName = normalized,
                        Active = true,
                        Created = DateTime.UtcNow
                    };

                    await _repository.Save(tag);
                }

                await _repository.Save(new CategoryTag
                {
                    CategoryId = category.CategoryId,
                    TagId = tag.TagId
                });
            }
        }

        private static IReadOnlyCollection<string> NormalizeTags(IEnumerable<string>? tags)
        {
            if (tags == null)
            {
                return Array.Empty<string>();
            }

            return tags
                .Select(t => t?.Trim() ?? string.Empty)
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Select(t => Regex.Replace(t.ToLowerInvariant(), @"\s+", " "))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(20)
                .ToArray();
        }
    }
}
