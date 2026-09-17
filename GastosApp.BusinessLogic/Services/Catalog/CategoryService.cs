using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
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
                .OrderBy(c => c.Name)
                .ThenBy(c => c.CategoryId)
                .ToListAsync();
        }

        public async Task<IEnumerable<Category>> GetAllActiveByUserIdAsync(int userId)
        {
            return await _repository.Get<Category>(c => (c.UserId == userId || c.UserId == null) && c.Active)
                .Include(c => c.CategoryTags)
                .ThenInclude(ct => ct.Tag)
                .OrderBy(c => c.Name)
                .ThenBy(c => c.CategoryId)
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
                .OrderBy(c => c.Name)
                .ThenBy(c => c.CategoryId)
                .ToListAsync();
        }

        public async Task<Category> CreateWithTagsAsync(Category category, int userId, IEnumerable<string>? tags)
        {
            category.UserId = userId;
            category.Created = DateTime.UtcNow;

            var createdCategory = await _repository.Save(category);
            await SyncTagsAsync(createdCategory, userId, tags);

            return (await GetByIdWithTagsAsync(createdCategory.CategoryId, userId)) ?? createdCategory;
        }

        public async Task<Category?> UpdateWithTagsAsync(int id, Category category, int userId, IEnumerable<string>? tags)
        {
            var existing = await _repository.GetTrack<Category>()
                .Include(c => c.CategoryTags)
                .ThenInclude(ct => ct.Tag)
                .FirstOrDefaultAsync(c => c.CategoryId == id && c.UserId == userId);

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

        public async Task<bool> UpdateActiveStatusAsync(int id, int userId, bool active)
        {
            var category = await _repository.GetTrack<Category>()
                .FirstOrDefaultAsync(c => c.CategoryId == id && c.UserId == userId);
            if (category == null)
            {
                return false;
            }

            category.Active = active;
            category.Updated = DateTime.UtcNow;
            await _repository.SaveChangesAsync();
            return true;
        }

        // Batching deliberado: 2 lecturas como máximo (relaciones + tags faltantes) y un único
        // SaveChangesAsync, sin importar el número de tags.
        //
        // No se reutiliza TagService.ResolveOrCreateAsync aunque también resuelve en bloque porque su
        // contrato no encaja: (1) hace su propio SaveChangesAsync, lo que impide un único commit final;
        // (2) obligaría a inyectar ITagService en este servicio; (3) su Normalize solo divide por ' '
        // mientras NormalizeTags colapsa cualquier whitespace (\s+), así que cambiaría el nombre
        // normalizado almacenado para entradas con tabs/saltos de línea.
        private async Task SyncTagsAsync(Category category, int userId, IEnumerable<string>? tags)
        {
            var normalizedTags = NormalizeTags(tags);

            var toKeep = new HashSet<string>(normalizedTags, StringComparer.OrdinalIgnoreCase);

            // Se consulta vía GetTrack para reutilizar las instancias ya rastreadas cuando el llamador
            // cargó la categoría con Include(CategoryTags) (UpdateWithTagsAsync): RemoveRange sobre
            // instancias no rastreadas chocaría con la identidad ya registrada en el change tracker.
            var existingRelations = await _repository.GetTrack<CategoryTag>()
                .Include(ct => ct.Tag)
                .Where(ct => ct.CategoryId == category.CategoryId)
                .ToListAsync();

            // Construcción tolerante a duplicados: un tag global (user_id NULL) y uno del usuario pueden
            // compartir NormalizedName (el único no los colisiona). Se conserva el primero de cada grupo,
            // que es el resultado previo en el caso normal (un solo tag por nombre).
            var existingByNormalized = new Dictionary<string, CategoryTag>(StringComparer.OrdinalIgnoreCase);
            foreach (var relation in existingRelations)
            {
                if (relation.Tag == null || existingByNormalized.ContainsKey(relation.Tag.NormalizedName))
                {
                    continue;
                }

                existingByNormalized[relation.Tag.NormalizedName] = relation;
            }

            var toRemove = existingRelations
                .Where(r => r.Tag != null && !toKeep.Contains(r.Tag.NormalizedName))
                .ToList();

            if (toRemove.Count > 0)
            {
                _repository.GetTrack<CategoryTag>().RemoveRange(toRemove);
            }

            var missingNormalized = normalizedTags
                .Where(normalized => !existingByNormalized.ContainsKey(normalized))
                .ToList();

            var relationsToAdd = new List<CategoryTag>(missingNormalized.Count);

            if (missingNormalized.Count > 0)
            {
                // Todos los tags faltantes en una sola consulta.
                var candidates = await _repository.Get<Tag>(t =>
                        (t.UserId == userId || t.UserId == null) && missingNormalized.Contains(t.NormalizedName))
                    .ToListAsync();

                var resolved = new Dictionary<string, Tag>(StringComparer.OrdinalIgnoreCase);
                foreach (var candidate in candidates)
                {
                    // Igual que el FirstOrDefaultAsync anterior: si existiera un tag global y uno del
                    // usuario con el mismo nombre normalizado, la BD decide cuál gana.
                    resolved[candidate.NormalizedName] = candidate;
                }

                // Pertenencia por referencia a los tags creados en esta llamada: no depende de que EF
                // materialice (o no) la clave generada en TagId antes del SaveChanges.
                var newTags = new HashSet<Tag>();
                foreach (var normalized in missingNormalized)
                {
                    if (resolved.ContainsKey(normalized))
                    {
                        continue;
                    }

                    var tag = new Tag
                    {
                        UserId = userId,
                        Name = normalized,
                        NormalizedName = normalized,
                        Active = true,
                        Created = DateTime.UtcNow
                    };

                    resolved[normalized] = tag;
                    newTags.Add(tag);
                }

                if (newTags.Count > 0)
                {
                    _repository.GetTrack<Tag>().AddRange(newTags);
                }

                foreach (var normalized in missingNormalized)
                {
                    var tag = resolved[normalized];

                    relationsToAdd.Add(newTags.Contains(tag)
                        ? new CategoryTag { CategoryId = category.CategoryId, Tag = tag }
                        : new CategoryTag { CategoryId = category.CategoryId, TagId = tag.TagId });
                }
            }

            if (relationsToAdd.Count > 0)
            {
                _repository.GetTrack<CategoryTag>().AddRange(relationsToAdd);
            }

            await _repository.SaveChangesAsync();
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
