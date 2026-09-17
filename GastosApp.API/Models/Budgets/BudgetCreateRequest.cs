namespace GastosApp.API.Models.Budgets;

/// <summary>
/// Alta de presupuesto mensual. Scope XOR: exactamente uno de <see cref="CategoryId"/>
/// o <see cref="SubcategoryId"/>. La validación de negocio la resuelve el servicio.
/// </summary>
public class BudgetCreateRequest
{
    /// <summary>Periodo en formato <c>yyyy-MM</c>. Requerido.</summary>
    public string? PeriodKey { get; set; }

    public string Name { get; set; } = string.Empty;

    public int? CategoryId { get; set; }

    public int? SubcategoryId { get; set; }

    public decimal AmountMxn { get; set; }

    public bool Active { get; set; } = true;

    /// <summary>Opcional en creación; vacío/null usa los umbrales por defecto del servicio.</summary>
    public List<BudgetThresholdRequest>? Thresholds { get; set; }
}
