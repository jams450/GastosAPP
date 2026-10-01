using GastosApp.API.Models.BudgetItems;
using GastosApp.API.Models.Budgets;

namespace GastosApp.API.Models.Plan;

/// <summary>
/// Resumen consolidado del plan de un periodo. Es una primera versión: el shape puede refinarse en
/// la Fase 3.5 (UI/BFF) sin tocar la agregación del backend.
/// </summary>
public class PlanSummaryResponse
{
    public string PeriodKey { get; set; } = string.Empty;

    /// <summary>Desglose por presupuesto, con el mismo contrato que <c>/api/budgets/status</c>.</summary>
    public IReadOnlyList<BudgetStatusResponse> Budgets { get; set; } = Array.Empty<BudgetStatusResponse>();

    public decimal PlannedIncome { get; set; }
    public decimal CommittedIncome { get; set; }
    public decimal ProjectedIncome { get; set; }
    public decimal ExecutedIncome { get; set; }

    public IReadOnlyList<PlanItemVarianceResponse> Variances { get; set; } = Array.Empty<PlanItemVarianceResponse>();

    public IReadOnlyList<BudgetItemResponse> ItemsWithoutBudget { get; set; } = Array.Empty<BudgetItemResponse>();

    public IReadOnlyList<PlanAccountFlowResponse> AccountFlows { get; set; } = Array.Empty<PlanAccountFlowResponse>();
}

/// <summary>Desviación de una partida ejecutada: <c>plannedAmount − executedAmount</c>.</summary>
public class PlanItemVarianceResponse
{
    public int ItemId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public decimal PlannedAmount { get; set; }
    public decimal ExecutedAmount { get; set; }
    public decimal Variance { get; set; }
}

/// <summary>Suma de lo planificado por cuenta. No es un saldo proyectado.</summary>
public class PlanAccountFlowResponse
{
    public int AccountId { get; set; }
    public decimal PlannedExpense { get; set; }
    public decimal PlannedIncome { get; set; }
    public int ItemCount { get; set; }
}
