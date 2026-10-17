namespace GastosApp.BusinessLogic.Models.Accounts;

/// <summary>
/// Proyección plana installment ↔ allocation que alimenta el cálculo canónico de deuda. Cada fila
/// representa una allocation de un installment (o el installment solo, cuando no tiene allocations):
/// <see cref="PaymentStatus"/> es el estado del pago que la aplicó y sólo las allocations Posted
/// reducen deuda. Es una proyección de lectura; no es una entidad persistida.
/// </summary>
public class AccountCreditInstallmentRow
{
    public int InstallmentId { get; set; }

    public int AccountId { get; set; }

    /// <summary>"Revolving" o "MSI".</summary>
    public string PlanType { get; set; } = string.Empty;

    /// <summary>Estado del installment: Open, PartiallyPaid, Overdue, Paid, etc.</summary>
    public string Status { get; set; } = string.Empty;

    public decimal TotalDue { get; set; }

    /// <summary>Monto de la allocation; null cuando el installment no tiene ninguna.</summary>
    public decimal? AllocatedAmount { get; set; }

    /// <summary>Estado del pago asociado; null cuando el installment no tiene allocations.</summary>
    public string? PaymentStatus { get; set; }
}
