using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface IBudgetService
    {
        Task<IReadOnlyList<Budget>> ListAsync(int userId, string? periodKey = null);
        Task<Budget?> GetAsync(int id, int userId);
        Task<Budget> CreateAsync(int userId, BudgetWriteInput input);
        Task<Budget?> UpdateAsync(int id, int userId, BudgetWriteInput input);
        Task<bool> SetActiveAsync(int id, int userId, bool active);
        /// <summary>Reemplaza el set completo de umbrales preservando los que ya tienen entregas.</summary>
        Task<Budget?> ReplaceThresholdsAsync(int id, int userId, IReadOnlyList<BudgetThresholdInput> thresholds);
        Task<BudgetStatusResult?> GetStatusAsync(int id, int userId);
        /// <summary>Estado de todos los presupuestos del periodo. <paramref name="periodKey"/> null => mes actual.</summary>
        Task<IReadOnlyList<BudgetStatusResult>> GetPeriodStatusAsync(int userId, string? periodKey = null);
    }
}
