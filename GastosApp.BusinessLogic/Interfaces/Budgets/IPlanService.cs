using GastosApp.BusinessLogic.Models.Budgets;

namespace GastosApp.BusinessLogic.Interfaces
{
    /// <summary>Vista consolidada del plan de un periodo: presupuestos, partidas, ingresos y desviaciones.</summary>
    public interface IPlanService
    {
        /// <summary>Resumen del plan. <paramref name="periodKey"/> null => mes actual.</summary>
        Task<PlanSummaryResult> GetSummaryAsync(int userId, string? periodKey);
    }
}
