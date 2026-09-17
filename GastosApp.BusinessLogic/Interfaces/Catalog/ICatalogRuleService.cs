using GastosApp.BusinessLogic.Models.CatalogRules;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ICatalogRuleService
    {
        Task<CatalogRule?> GetByIdAsync(int id, int userId);

        Task<IEnumerable<CatalogRule>> GetByUserIdAsync(int userId, bool onlyActive = false);

        Task<CatalogRule> CreateAsync(CatalogRule rule, int userId);

        Task<CatalogRule?> UpdateAsync(int id, CatalogRule rule, int userId);

        Task<bool> SetActiveAsync(int id, int userId, bool active);

        /// <summary>
        /// Primera regla activa del usuario que coincide con la descripción normalizada
        /// (prioridad ascendente, desempate por <c>rule_id</c>). Devuelve <c>null</c> si no hay match.
        /// </summary>
        Task<CatalogRuleResolution?> ResolveAsync(int userId, string? description);
    }
}
