namespace GastosApp.API.Models.Budgets;

public class BudgetResponse
{
    public int BudgetId { get; set; }
    public int UserId { get; set; }
    public string PeriodKey { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public decimal AmountMxn { get; set; }
    public bool Active { get; set; }
    public DateTime? Created { get; set; }
    public DateTime? Updated { get; set; }
    public IReadOnlyList<BudgetThresholdResponse> Thresholds { get; set; } = Array.Empty<BudgetThresholdResponse>();
}

public class BudgetThresholdResponse
{
    public int ThresholdId { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Percent { get; set; }
    public bool Active { get; set; }
}
