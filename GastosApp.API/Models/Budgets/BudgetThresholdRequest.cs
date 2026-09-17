namespace GastosApp.API.Models.Budgets;

/// <summary>Umbral de consumo. <see cref="Percent"/> puede superar 100 (sobregiro).</summary>
public class BudgetThresholdRequest
{
    public string Name { get; set; } = string.Empty;

    public decimal Percent { get; set; }

    public bool Active { get; set; } = true;
}
