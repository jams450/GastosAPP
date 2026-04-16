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
    public decimal CurrentBalance { get; set; }
    public bool EarnsInterest { get; set; }
    public decimal AnnualInterestRate { get; set; }
    public decimal? CreditLimit { get; set; }
}
