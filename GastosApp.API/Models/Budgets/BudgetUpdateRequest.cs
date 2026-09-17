namespace GastosApp.API.Models.Budgets;

/// <summary>
/// Edición de presupuesto. El periodo no es mutable: no se declara <c>periodKey</c>.
/// Scope XOR: exactamente uno de <see cref="CategoryId"/> o <see cref="SubcategoryId"/>.
/// </summary>
public class BudgetUpdateRequest
{
    public string Name { get; set; } = string.Empty;

    public int? CategoryId { get; set; }

    public int? SubcategoryId { get; set; }

    public decimal AmountMxn { get; set; }

    public bool Active { get; set; } = true;
}
