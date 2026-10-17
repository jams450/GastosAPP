using GastosApp.BusinessLogic.Models.Accounts;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Services;

/// <summary>
/// Cálculo canónico y puro de la deuda de crédito que expone el catálogo de cuentas. Replica el
/// breakdown de <c>fn_dashboard_credit_overview</c> sin depender de la función (que sólo mira cuentas
/// activas): installments pendientes (Open/PartiallyPaid/Overdue) por <c>total_due</c> menos las
/// allocations reducidas por pagos <c>Posted</c>, con piso por installment, separadas Revolving/MSI.
/// Nunca usa el balance contable y no escribe nada.
/// </summary>
public static class AccountCreditSnapshotCalculator
{
    private const string PostedPaymentStatus = "Posted";
    private const string MsiPlanType = "MSI";

    private static readonly HashSet<string> OutstandingStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Open",
        "PartiallyPaid",
        "Overdue"
    };

    /// <summary>
    /// Construye un snapshot por cada cuenta de crédito en <paramref name="ownedAccounts"/> —incluidas
    /// las inactivas— y le suma la deuda pendiente de las filas de <paramref name="installmentRows"/>.
    /// Las filas de cuentas ajenas o de efectivo se ignoran; una cuenta de crédito sin filas queda en
    /// cero (no null), porque "sin deuda" es un dato válido.
    /// </summary>
    public static IReadOnlyDictionary<int, AccountCreditSnapshot> Calculate(
        IEnumerable<Account> ownedAccounts,
        IEnumerable<AccountCreditInstallmentRow> installmentRows)
    {
        ArgumentNullException.ThrowIfNull(ownedAccounts);
        ArgumentNullException.ThrowIfNull(installmentRows);

        var snapshots = new Dictionary<int, AccountCreditSnapshot>();
        foreach (var account in ownedAccounts)
        {
            if (!account.IsCredit) continue;

            snapshots[account.AccountId] = new AccountCreditSnapshot
            {
                AccountId = account.AccountId,
                CreditLimit = account.CreditLimit
            };
        }

        var rows = installmentRows as IList<AccountCreditInstallmentRow> ?? installmentRows.ToList();

        // Preagregado una sola vez por installment: sólo las allocations reducidas por pagos Posted cuentan.
        var postedAllocationsByInstallment = rows
            .Where(row => string.Equals(row.PaymentStatus, PostedPaymentStatus, StringComparison.OrdinalIgnoreCase))
            .GroupBy(row => row.InstallmentId)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.AllocatedAmount ?? 0m));

        foreach (var installment in rows.GroupBy(row => row.InstallmentId))
        {
            var row = installment.First();
            if (!OutstandingStatuses.Contains(row.Status)) continue;
            if (!snapshots.TryGetValue(row.AccountId, out var snapshot)) continue;

            var posted = postedAllocationsByInstallment.TryGetValue(row.InstallmentId, out var allocated)
                ? allocated
                : 0m;
            var outstanding = Math.Max(row.TotalDue - posted, 0m);

            if (string.Equals(row.PlanType, MsiPlanType, StringComparison.OrdinalIgnoreCase))
            {
                snapshot.MsiOutstanding += outstanding;
            }
            else
            {
                snapshot.NormalOutstanding += outstanding;
            }
        }

        return snapshots;
    }
}
