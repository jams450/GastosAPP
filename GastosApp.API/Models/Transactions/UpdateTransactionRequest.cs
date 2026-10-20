using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class UpdateTransactionRequest
{
    [Range(1, int.MaxValue)]
    public int? CategoryId { get; set; }
    [Range(1, int.MaxValue)]
    public int? SubcategoryId { get; set; }
    [Range(1, int.MaxValue)]
    public int? MerchantId { get; set; }
    public bool ClearAnalytics { get; set; }
    public IEnumerable<string>? Tags { get; set; }

    [Range(0.01, double.MaxValue)]
    public decimal? Amount { get; set; }

    public string? Description { get; set; }

    public DateTimeOffset? TransactionDate { get; set; }

    public List<TransactionAllocationRequest>? Allocations { get; set; }

    public bool ReplaceAllocations { get; set; } = false;

    /// <summary>
    /// Marca o desmarca el ingreso como rendimiento. <c>null</c> deja el valor actual: la edición
    /// no cambia una clasificación que el cliente no pidió tocar.
    /// </summary>
    public bool? IsInterest { get; set; }

    /// <summary>
    /// Divisa de captura. <c>null</c> deja la actual: la edición no cambia la moneda de un movimiento
    /// que el cliente no pidió tocar.
    /// </summary>
    [StringLength(3, MinimumLength = 3)]
    public string? CurrencyCode { get; set; }

    /// <summary>
    /// Tasa a guardar. <c>null</c> conserva la del movimiento: el cliente que no la manda escribe una
    /// descripción, no una conversión. Si se envía un valor distinto, se re-congela junto con la fecha
    /// del movimiento y se recalcula el importe en pesos.
    /// </summary>
    [Range(0.00000001, double.MaxValue)]
    public decimal? FxRate { get; set; }

    /// <summary>Fecha de la tasa enviada. Sin ella se usa la fecha del movimiento.</summary>
    public DateOnly? FxRateDate { get; set; }
}
