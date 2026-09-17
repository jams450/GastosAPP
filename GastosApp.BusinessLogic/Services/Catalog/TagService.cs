using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class TagService : ITagService
    {
        private const int MaxNameLength = 80;
        private readonly IRepository _repository;

        public TagService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<Tag?> GetByIdAsync(int id, int userId)
        {
            return await BuildReadableScope(userId)
                .Where(t => t.TagId == id)
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Tag>> GetByUserIdAsync(int userId, bool onlyActive = false)
        {
            return await BuildReadableScope(userId)
                .Where(t => !onlyActive || t.Active)
                .OrderBy(t => t.Name)
                .ThenBy(t => t.TagId)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tag>> SearchAsync(int userId, string query, int take = 20)
        {
            query = Normalize(query);
            if (string.IsNullOrWhiteSpace(query))
            {
                return Array.Empty<Tag>();
            }

            return await BuildReadableScope(userId)
                .Where(t => t.Active && t.NormalizedName.Contains(query))
                .OrderBy(t => t.Name)
                .ThenBy(t => t.TagId)
                .Take(Math.Clamp(take, 1, 100))
                .ToListAsync();
        }

        public async Task<Tag> CreateAsync(Tag tag, int userId)
        {
            var (cleanName, normalizedName) = NormalizeNameOrThrow(tag.Name);
            tag.UserId = userId;
            tag.Name = cleanName;
            tag.NormalizedName = normalizedName;
            tag.Active = true;

            try
            {
                return await _repository.Save(tag);
            }
            catch (DbUpdateException ex)
            {
                throw new ArgumentException("A tag with same name already exists for this user", ex);
            }
        }

        public async Task<Tag?> UpdateAsync(int id, Tag tag, int userId)
        {
            var existing = await BuildWritableScope(userId)
                .FirstOrDefaultAsync(t => t.TagId == id);

            if (existing == null)
            {
                return null;
            }

            var (cleanName, normalizedName) = NormalizeNameOrThrow(tag.Name);
            existing.Name = cleanName;
            existing.NormalizedName = normalizedName;

            try
            {
                await _repository.SaveChangesAsync();
                return existing;
            }
            catch (DbUpdateException ex)
            {
                throw new ArgumentException("A tag with same name already exists for this user", ex);
            }
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, int userId, bool active)
        {
            var existing = await BuildWritableScope(userId)
                .FirstOrDefaultAsync(t => t.TagId == id);

            if (existing == null)
            {
                return false;
            }

            existing.Active = active;
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

            var existing = await BuildReadableScope(userId)
                .Where(t => normalizedTags.Contains(t.NormalizedName))
                .ToListAsync();

            var existingSet = existing.Select(t => t.NormalizedName).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var created = new List<Tag>();

            foreach (var normalized in normalizedTags.Where(t => !existingSet.Contains(t)))
            {
                created.Add(new Tag
                {
                    UserId = userId,
                    Name = normalized,
                    NormalizedName = normalized,
                    Active = true
                });
            }

            if (created.Count > 0)
            {
                _repository.GetTrack<Tag>().AddRange(created);
                try
                {
                    await _repository.SaveChangesAsync();
                }
                catch (DbUpdateException)
                {
                    var refreshed = await BuildReadableScope(userId)
                        .Where(t => normalizedTags.Contains(t.NormalizedName))
                        .ToListAsync();

                    return refreshed;
                }
            }

            return existing.Concat(created).ToList();
        }

        private IQueryable<Tag> BuildReadableScope(int userId)
        {
            return _repository.Get<Tag>(t => t.UserId == userId || t.UserId == null);
        }

        private IQueryable<Tag> BuildWritableScope(int userId)
        {
            return _repository.GetTrack<Tag>().Where(t => t.UserId == userId);
        }

        private static (string Name, string NormalizedName) NormalizeNameOrThrow(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new ArgumentException("Tag name is required");
            }

            var cleanedName = value.Trim();
            if (cleanedName.Length > MaxNameLength)
            {
                throw new ArgumentException($"Tag name cannot exceed {MaxNameLength} characters");
            }

            return (cleanedName, Normalize(cleanedName));
        }

        private static string Normalize(string value)
            => string.Join(' ', (value ?? string.Empty).Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}
