using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class TagService : ITagService
    {
        private readonly IRepository _repository;

        public TagService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<Tag?> GetByIdAsync(int id, int userId)
        {
            return await _repository.Get<Tag>(t => t.TagId == id && (t.UserId == userId || t.UserId == null))
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Tag>> GetByUserIdAsync(int userId, bool onlyActive = false)
        {
            return await _repository.Get<Tag>(t => (t.UserId == userId || t.UserId == null) && (!onlyActive || t.Active))
                .OrderBy(t => t.Name)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tag>> SearchAsync(int userId, string query, int take = 20)
        {
            query = Normalize(query);
            if (string.IsNullOrWhiteSpace(query))
            {
                return Array.Empty<Tag>();
            }

            return await _repository.Get<Tag>(t => (t.UserId == userId || t.UserId == null) && t.Active && t.NormalizedName.Contains(query))
                .OrderBy(t => t.Name)
                .Take(Math.Clamp(take, 1, 100))
                .ToListAsync();
        }

        public async Task<Tag> CreateAsync(Tag tag, int userId)
        {
            tag.UserId = userId;
            tag.Name = tag.Name.Trim();
            tag.NormalizedName = Normalize(tag.Name);
            tag.Active = true;
            tag.Created = DateTime.UtcNow;
            return await _repository.Save(tag);
        }

        public async Task<Tag?> UpdateAsync(int id, Tag tag, int userId)
        {
            var existing = await _repository.GetTrack<Tag>()
                .FirstOrDefaultAsync(t => t.TagId == id && (t.UserId == userId || t.UserId == null));

            if (existing == null)
            {
                return null;
            }

            existing.Name = tag.Name.Trim();
            existing.NormalizedName = Normalize(existing.Name);
            existing.Active = tag.Active;
            existing.Updated = DateTime.UtcNow;
            await _repository.SaveChangesAsync();
            return existing;
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, int userId, bool active)
        {
            var existing = await _repository.GetTrack<Tag>()
                .FirstOrDefaultAsync(t => t.TagId == id && (t.UserId == userId || t.UserId == null));

            if (existing == null)
            {
                return false;
            }

            existing.Active = active;
            existing.Updated = DateTime.UtcNow;
            await _repository.SaveChangesAsync();
            return true;
        }

        public async Task<IReadOnlyCollection<Tag>> ResolveOrCreateAsync(int userId, IEnumerable<string>? tagNames)
        {
            var normalizedTags = (tagNames ?? Array.Empty<string>())
                .Select(Normalize)
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(20)
                .ToList();

            if (normalizedTags.Count == 0)
            {
                return Array.Empty<Tag>();
            }

            var existing = await _repository.Get<Tag>(t => (t.UserId == userId || t.UserId == null) && normalizedTags.Contains(t.NormalizedName))
                .ToListAsync();

            var existingSet = existing.Select(t => t.NormalizedName).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var created = new List<Tag>();

            foreach (var normalized in normalizedTags.Where(t => !existingSet.Contains(t)))
            {
                var tag = new Tag
                {
                    UserId = userId,
                    Name = normalized,
                    NormalizedName = normalized,
                    Active = true,
                    Created = DateTime.UtcNow
                };

                created.Add(await _repository.Save(tag));
            }

            return existing.Concat(created).ToList();
        }

        private static string Normalize(string value)
            => string.Join(' ', (value ?? string.Empty).Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}
