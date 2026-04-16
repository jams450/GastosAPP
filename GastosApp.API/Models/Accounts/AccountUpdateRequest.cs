using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Accounts;

public class AccountUpdateRequest
{
    [StringLength(100)]
    public string? Name { get; set; }

    [StringLength(7)]
    public string? Color { get; set; }

    public bool? Active { get; set; }

    public DateTime? StartDate { get; set; }

    public bool? IsCredit { get; set; }

    [Range(1, 31)]
    public int? DueDay { get; set; }

    [Range(1, 31)]
    public int? PaymentDueDay { get; set; }

    public bool? EarnsInterest { get; set; }

    public decimal? CurrentBalance { get; set; }
    public decimal? CreditLimit { get; set; }

    [Range(0, 999.99)]
    public decimal? AnnualInterestRate { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (DueDay.HasValue && (DueDay.Value < 1 || DueDay.Value > 31))
        {
            yield return new ValidationResult(
                "DueDay must be between 1 and 31",
                new[] { nameof(DueDay) });
        }

        if (PaymentDueDay.HasValue && (PaymentDueDay.Value < 1 || PaymentDueDay.Value > 31))
        {
            yield return new ValidationResult(
                "PaymentDueDay must be between 1 and 31",
                new[] { nameof(PaymentDueDay) });
        }

        if (IsCredit == true && !DueDay.HasValue)
        {
            yield return new ValidationResult(
                "DueDay is required when IsCredit is true",
                new[] { nameof(DueDay) });
        }

        if (IsCredit == true && CreditLimit <= 0)
        {
            yield return new ValidationResult(
                "CreditLimit must be greater than 0 when IsCredit is true",
                new[] { nameof(CreditLimit) });
        }

        if (EarnsInterest == true && (!AnnualInterestRate.HasValue || AnnualInterestRate.Value <= 0))
        {
            yield return new ValidationResult(
                "AnnualInterestRate must be greater than 0 when EarnsInterest is true",
                new[] { nameof(AnnualInterestRate) });
        }
    }
}
