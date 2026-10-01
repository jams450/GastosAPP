namespace GastosApp.API.Models.Budgets;

/// <summary>
/// Estado de consumo de un presupuesto. Aditivo respecto a Fase 2: <c>percentUsed</c> ahora es el
/// desglose mostrado (<c>spentPercent</c> + <c>committedPercent</c>) y <c>thresholdPercent</c> es el
/// número que decide el umbral según <c>Alerts:CommittedCountsEnabled</c>.
/// </summary>
public class BudgetStatusResponse
{
    public int BudgetId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string PeriodKey { get; set; } = string.Empty;
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public bool Active { get; set; }
    public decimal AmountMxn { get; set; }

    /// <summary>Gasto real ejecutado del periodo.</summary>
    public decimal Spent { get; set; }

    public decimal SpentPercent { get; set; }

    /// <summary>Planificado no ejecutado con periodo abierto. Cero si el periodo cerró.</summary>
    public decimal Committed { get; set; }

    public decimal CommittedPercent { get; set; }

    /// <summary>Cuotas derivadas de promedio no confirmadas. Fuera del porcentaje por default.</summary>
    public decimal Projected { get; set; }

    public decimal ProjectedPercent { get; set; }

    /// <summary><c>spent</c> + <c>committed</c>.</summary>
    public decimal Effective { get; set; }

    /// <summary><c>effective</c> + <c>projected</c>. Informativo.</summary>
    public decimal Forecast { get; set; }

    /// <summary>Desglose mostrado: <c>spentPercent</c> + <c>committedPercent</c>.</summary>
    public decimal PercentUsed { get; set; }

    /// <summary>Porcentaje que decide <c>status</c> y <c>reachedThreshold</c>.</summary>
    public decimal ThresholdPercent { get; set; }

    /// <summary><c>amountMxn</c> − <c>effective</c>.</summary>
    public decimal Remaining { get; set; }

    /// <summary>Suma de lo planificado en partidas no canceladas del scope.</summary>
    public decimal PlannedAmount { get; set; }

    /// <summary><c>plannedAmount</c> − <c>spent</c>.</summary>
    public decimal Variance { get; set; }

    public int ItemsPending { get; set; }
    public int ItemsExecuted { get; set; }

    /// <summary>Partidas <c>pending</c> de un periodo cerrado: caducaron sin ejecutarse.</summary>
    public int ItemsUnexecuted { get; set; }

    public int ItemsIgnored { get; set; }

    public decimal PlannedIncome { get; set; }
    public decimal CommittedIncome { get; set; }
    public decimal ProjectedIncome { get; set; }

    /// <summary><c>ok</c>, <c>warning</c> o <c>exceeded</c>.</summary>
    public string Status { get; set; } = string.Empty;

    public BudgetThresholdStatusResponse? ReachedThreshold { get; set; }
}

public class BudgetThresholdStatusResponse
{
    public int ThresholdId { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Percent { get; set; }
}
