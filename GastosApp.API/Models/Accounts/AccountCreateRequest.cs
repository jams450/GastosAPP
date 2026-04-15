using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Accounts;

public class AccountCreateRequest
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(7)]
    public string Color { get; set; } = "#000000";

    [Required]
    public DateTime StartDate { get; set; }

    public bool IsCredit { get; set; } = false;

    public int? DueDay { get; set; }

    public bool EarnsInterest { get; set; } = false;

    public decimal? CurrentBalance { get; set; }

    public decimal? CreditLimit { get; set; }

    [Range(0, 999.99)]
    public decimal AnnualInterestRate { get; set; } = 0.00m;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (IsCredit && !DueDay.HasValue)
        {
            yield return new ValidationResult(
                "DueDay is required when IsCredit is true",
                new[] { nameof(DueDay) });
        }

        if (IsCredit && CreditLimit <= 0)
        {
            yield return new ValidationResult(
                "CreditLimit must be greater than 0 when IsCredit is true",
                new[] { nameof(CreditLimit) });
        }

        if (EarnsInterest && AnnualInterestRate <= 0)
        {
            yield return new ValidationResult(
                "AnnualInterestRate must be greater than 0 when EarnsInterest is true",
                new[] { nameof(AnnualInterestRate) });
        }
    }
}
