namespace GastosApp.API.Models.Accounts;

public class AccountResponse
{
    public int AccountId { get; set; }
    public int UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty;
    public bool Active { get; set; }
    public DateTime StartDate { get; set; }
    public bool IsCredit { get; set; }
    public int? DueDay { get; set; }
    public int? PaymentDueDay { get; set; }
    public decimal InitialBalance { get; set; }
    public decimal CurrentBalance { get; set; }
    public bool EarnsInterest { get; set; }
    public decimal AnnualInterestRate { get; set; }
    public decimal? CreditLimit { get; set; }

    /// <summary>
    /// Deuda Revolving canónica pendiente. Null en cuentas de efectivo (no aplica); cero en una
    /// cuenta de crédito sin installments pendientes.
    /// </summary>
    public decimal? NormalOutstanding { get; set; }

    /// <summary>Deuda MSI canónica pendiente. Null en efectivo; cero sin MSI pendiente.</summary>
    public decimal? MsiOutstanding { get; set; }

    /// <summary>Deuda total canónica = normal + MSI. Null en efectivo.</summary>
    public decimal? CurrentDebt { get; set; }

    /// <summary>Crédito disponible = límite - deuda (puede ser negativo). Null en efectivo o sin límite.</summary>
    public decimal? CreditAvailable { get; set; }
}
