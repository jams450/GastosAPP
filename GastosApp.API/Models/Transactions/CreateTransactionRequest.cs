using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class CreateTransactionRequest : IValidatableObject
{
    [Range(1, int.MaxValue)]
    public int AccountId { get; set; }

    public int? CategoryId { get; set; }

    public int? SubcategoryId { get; set; }

    public int? MerchantId { get; set; }

    public IEnumerable<string>? Tags { get; set; }

    [Required]
    [Range(0.01, double.MaxValue)]
    public decimal Amount { get; set; }

    public string? Description { get; set; }

    [Required]
    public DateTimeOffset TransactionDate { get; set; }

    [Range(2, 60)]
    public int? MsiMonths { get; set; }

    public List<CreditInstallmentAllocationRequest>? CreditAllocations { get; set; }

    public List<TransactionAllocationRequest>? Allocations { get; set; }

    /// <summary>
    /// Partida <c>pending</c> a la que se enlaza este gasto al crearse (alta "desde partida").
    /// Opcional: sin valor el alta es la de siempre. La elegibilidad se valida en el API antes de
    /// escribir, así que un id inválido responde 400 sin alta parcial.
    /// </summary>
    [Range(1, int.MaxValue)]
    public int? BudgetItemId { get; set; }

    /// <summary>
    /// Marca el ingreso como rendimiento de una cuenta que devenga interés. Solo clasifica: el
    /// movimiento sigue siendo <c>income</c> y mueve el saldo igual que cualquier otro ingreso.
    /// El servicio rechaza la marca cuando la cuenta no devenga interés, así que la regla no
    /// depende del cliente.
    /// </summary>
    public bool IsInterest { get; set; }

    /// <summary>
    /// Divisa de captura. Sin valor, el movimiento queda en la divisa base (MXN).
    /// </summary>
    [StringLength(3, MinimumLength = 3)]
    public string? CurrencyCode { get; set; }

    /// <summary>
    /// Tipo de cambio en pesos por una unidad de <see cref="CurrencyCode"/>. Opcional: sin valor se
    /// toma la última tasa publicada en o antes de la fecha del movimiento y se congela con él.
    /// </summary>
    [Range(0.00000001, double.MaxValue)]
    public decimal? FxRate { get; set; }

    /// <summary>
    /// Fecha de la tasa enviada. Solo aplica junto con <see cref="FxRate"/>; sin ella se usa la fecha
    /// del movimiento, porque una tasa escrita a mano ya no proviene de una publicación.
    /// </summary>
    public DateOnly? FxRateDate { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (TransactionDate == default)
        {
            yield return new ValidationResult("TransactionDate is required.", [nameof(TransactionDate)]);
        }
    }
}
