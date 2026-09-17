using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.CatalogRules;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// CRUD y resolución de reglas deterministas de categorización. El destino es XOR
    /// (categoría o subcategoría) y debe ser accesible por el usuario (propio o global)
    /// con tipo de categoría <c>expense</c>.
    /// </summary>
    public class CatalogRuleService : ICatalogRuleService
    {
        private const int MaxNameLength = 120;
        private const int MaxMatchValueLength = 200;

        private readonly IRepository _repository;
        private readonly ITransactionValidationService _validation;

        public CatalogRuleService(IRepository repository, ITransactionValidationService validation)
        {
            _repository = repository;
            _validation = validation;
        }

        public async Task<CatalogRule?> GetByIdAsync(int id, int userId)
        {
            return await _repository.Get<CatalogRule>(r => r.RuleId == id && r.UserId == userId)
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<CatalogRule>> GetByUserIdAsync(int userId, bool onlyActive = false)
        {
            return await _repository.Get<CatalogRule>(r => r.UserId == userId && (!onlyActive || r.Active))
                .OrderBy(r => r.Priority)
                .ThenBy(r => r.RuleId)
                .ToListAsync();
        }

        public async Task<CatalogRule> CreateAsync(CatalogRule rule, int userId)
        {
            var (name, matchType, matchValue) = NormalizeOrThrow(rule);
            await ValidateTargetsOrThrowAsync(userId, rule.TargetCategoryId, rule.TargetSubcategoryId);

            rule.UserId = userId;
            rule.Name = name;
            rule.MatchType = matchType;
            rule.MatchValue = matchValue;
            rule.Created = DateTime.UtcNow;

            return await _repository.Save(rule);
        }

        public async Task<CatalogRule?> UpdateAsync(int id, CatalogRule rule, int userId)
        {
            var existing = await _repository.GetTrack<CatalogRule>()
                .FirstOrDefaultAsync(r => r.RuleId == id && r.UserId == userId);
            if (existing == null)
            {
                return null;
            }

            var (name, matchType, matchValue) = NormalizeOrThrow(rule);
            await ValidateTargetsOrThrowAsync(userId, rule.TargetCategoryId, rule.TargetSubcategoryId);

            existing.Name = name;
            existing.MatchType = matchType;
            existing.MatchValue = matchValue;
            existing.TargetCategoryId = rule.TargetCategoryId;
            existing.TargetSubcategoryId = rule.TargetSubcategoryId;
            existing.Priority = rule.Priority;
            existing.Active = rule.Active;
            existing.Updated = DateTime.UtcNow;

            await _repository.SaveChangesAsync();
            return existing;
        }

        public async Task<bool> SetActiveAsync(int id, int userId, bool active)
        {
            var existing = await _repository.GetTrack<CatalogRule>()
                .FirstOrDefaultAsync(r => r.RuleId == id && r.UserId == userId);
            if (existing == null)
            {
                return false;
            }

            existing.Active = active;
            existing.Updated = DateTime.UtcNow;
            await _repository.SaveChangesAsync();
            return true;
        }

        public async Task<CatalogRuleResolution?> ResolveAsync(int userId, string? description)
        {
            var normalizedDescription = CatalogTextNormalizer.Normalize(description);
            if (normalizedDescription.Length == 0)
            {
                return null;
            }

            // ponytail: match evaluado en memoria (la normalización es C#-side, no indexable).
            // Si el volumen de reglas por usuario crece, mover a columnas normalizadas + prefiltro SQL.
            var rules = await _repository.Get<CatalogRule>(r => r.UserId == userId && r.Active)
                .OrderBy(r => r.Priority)
                .ThenBy(r => r.RuleId)
                .ToListAsync();

            foreach (var rule in rules)
            {
                if (!Matches(rule, normalizedDescription))
                {
                    continue;
                }

                var resolution = await BuildResolutionAsync(userId, rule);
                if (resolution != null)
                {
                    return resolution;
                }
            }

            return null;
        }

        private static bool Matches(CatalogRule rule, string normalizedDescription)
        {
            if (string.IsNullOrEmpty(rule.MatchValue))
            {
                return false;
            }

            var matchType = (rule.MatchType ?? string.Empty).Trim().ToLowerInvariant();
            return matchType switch
            {
                CatalogRuleMatchType.Contains => normalizedDescription.Contains(rule.MatchValue, StringComparison.Ordinal),
                CatalogRuleMatchType.Exact => normalizedDescription.Equals(rule.MatchValue, StringComparison.Ordinal),
                CatalogRuleMatchType.StartsWith => normalizedDescription.StartsWith(rule.MatchValue, StringComparison.Ordinal),
                _ => false
            };
        }

        /// <summary>
        /// Destino aplicable a la transacción. Una subcategoría deriva su categoría padre;
        /// si el destino ya no es visible para el usuario, la regla se descarta.
        /// </summary>
        private async Task<CatalogRuleResolution?> BuildResolutionAsync(int userId, CatalogRule rule)
        {
            if (rule.TargetSubcategoryId.HasValue)
            {
                var subcategory = await _repository
                    .Get<Subcategory>(s => s.SubcategoryId == rule.TargetSubcategoryId.Value && (s.UserId == userId || s.UserId == null))
                    .Select(s => new { s.CategoryId })
                    .FirstOrDefaultAsync();

                return subcategory == null
                    ? null
                    : new CatalogRuleResolution(subcategory.CategoryId, rule.TargetSubcategoryId.Value);
            }

            return rule.TargetCategoryId.HasValue
                ? new CatalogRuleResolution(rule.TargetCategoryId.Value, null)
                : null;
        }

        private static (string Name, string MatchType, string MatchValue) NormalizeOrThrow(CatalogRule rule)
        {
            if (string.IsNullOrWhiteSpace(rule.Name))
            {
                throw new ArgumentException("El nombre de la regla es requerido");
            }

            var name = rule.Name.Trim();
            if (name.Length > MaxNameLength)
            {
                throw new ArgumentException($"El nombre de la regla no puede exceder {MaxNameLength} caracteres");
            }

            var matchType = (rule.MatchType ?? string.Empty).Trim().ToLowerInvariant();
            if (matchType is not (CatalogRuleMatchType.Contains or CatalogRuleMatchType.Exact or CatalogRuleMatchType.StartsWith))
            {
                throw new ArgumentException(
                    $"match_type inválido: se espera {CatalogRuleMatchType.Contains}, {CatalogRuleMatchType.Exact} o {CatalogRuleMatchType.StartsWith}");
            }

            var matchValue = CatalogTextNormalizer.Normalize(rule.MatchValue);
            if (matchValue.Length == 0)
            {
                throw new ArgumentException("El valor de match de la regla es requerido");
            }

            if (matchValue.Length > MaxMatchValueLength)
            {
                throw new ArgumentException($"El valor de match no puede exceder {MaxMatchValueLength} caracteres");
            }

            return (name, matchType, matchValue);
        }

        /// <summary>
        /// Valida el XOR de destinos y su accesibilidad (propio/global, categoría padre expense)
        /// reutilizando <see cref="ITransactionValidationService.ValidateAnalyticsDimensionsAsync"/>.
        /// </summary>
        private async Task ValidateTargetsOrThrowAsync(int userId, int? targetCategoryId, int? targetSubcategoryId)
        {
            if (targetCategoryId.HasValue == targetSubcategoryId.HasValue)
            {
                throw new ArgumentException("La regla debe apuntar a una categoría o a una subcategoría, nunca a ambas ni a ninguna");
            }

            if (targetCategoryId.HasValue)
            {
                var validation = await _validation.ValidateAnalyticsDimensionsAsync(
                    userId,
                    targetCategoryId,
                    null,
                    null,
                    TransactionDomainConstants.TransactionType.Expense);

                if (!validation.IsValid)
                {
                    throw new ArgumentException(validation.ErrorMessage ?? "Destino de la regla inválido");
                }

                return;
            }

            var subcategory = await _repository
                .Get<Subcategory>(s => s.SubcategoryId == targetSubcategoryId!.Value && (s.UserId == userId || s.UserId == null))
                .Select(s => new { s.SubcategoryId, s.CategoryId })
                .FirstOrDefaultAsync();

            if (subcategory == null)
            {
                throw new ArgumentException($"Subcategory with ID {targetSubcategoryId!.Value} not found");
            }

            var subcategoryValidation = await _validation.ValidateAnalyticsDimensionsAsync(
                userId,
                subcategory.CategoryId,
                subcategory.SubcategoryId,
                null,
                TransactionDomainConstants.TransactionType.Expense);

            if (!subcategoryValidation.IsValid)
            {
                throw new ArgumentException(subcategoryValidation.ErrorMessage ?? "Destino de la regla inválido");
            }
        }
    }
}
