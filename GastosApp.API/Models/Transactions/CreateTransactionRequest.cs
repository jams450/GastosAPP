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

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (TransactionDate == default)
        {
            yield return new ValidationResult("TransactionDate is required.", [nameof(TransactionDate)]);
        }
    }
}
