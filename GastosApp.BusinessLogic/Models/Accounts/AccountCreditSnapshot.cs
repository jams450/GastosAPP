namespace GastosApp.BusinessLogic.Models.Accounts;

/// <summary>
/// Snapshot canónico de crédito de una cuenta propia. Sólo se construye para cuentas de crédito,
/// incluidas las inactivas; una cuenta de efectivo nunca lo recibe. La deuda no se infiere del
/// balance contable: sale de los installments pendientes menos las allocations Posted.
/// </summary>
public class AccountCreditSnapshot
{
    public int AccountId { get; set; }

    /// <summary>Deuda Revolving pendiente (installments Open/PartiallyPaid/Overdue).</summary>
    public decimal NormalOutstanding { get; set; }

    /// <summary>Deuda MSI pendiente (installments Open/PartiallyPaid/Overdue).</summary>
    public decimal MsiOutstanding { get; set; }

    /// <summary>Deuda total actual = normal + MSI.</summary>
    public decimal CurrentDebt => NormalOutstanding + MsiOutstanding;

    /// <summary>Límite declarado de la cuenta; null cuando no hay límite y el disponible no es calculable.</summary>
    public decimal? CreditLimit { get; set; }

    /// <summary>Crédito disponible = límite - deuda. Negativo si la deuda excede el límite. Null sin límite.</summary>
    public decimal? CreditAvailable => CreditLimit.HasValue ? CreditLimit.Value - CurrentDebt : null;
}
