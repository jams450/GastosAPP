namespace GastosApp.API.Models.Budgets;

public class BudgetStatusResponse
{
    public int BudgetId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string PeriodKey { get; set; } = string.Empty;
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public bool Active { get; set; }
    public decimal AmountMxn { get; set; }
    public decimal Spent { get; set; }
    public decimal Remaining { get; set; }
    public decimal PercentUsed { get; set; }

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
