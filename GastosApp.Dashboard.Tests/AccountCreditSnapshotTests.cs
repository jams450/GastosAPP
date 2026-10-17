using GastosApp.BusinessLogic.Models.Accounts;
using GastosApp.BusinessLogic.Services;
using GastosApp.Models.Entities;

namespace GastosApp.Dashboard.Tests;

/// <summary>
/// Regresión enfocada del snapshot de crédito canónico que alimenta GET /api/accounts: la deuda es
/// Σ por installment de max(total_due - allocations Posted, 0), separada Revolving/MSI, y de ahí
/// salen CurrentDebt y CreditAvailable (nunca del balance contable). Sin EF, sin reloj y sin base de
/// datos: las cuentas y las partidas se declaran explícitas, así que la única variable es el álgebra
/// canónica. La query owner-scoped real se apoya en este mismo cálculo.
/// </summary>
public static class AccountCreditSnapshotTests
{
    public static Task RunAsync()
    {
        var checks = 0;
        void Check(bool condition, string name)
        {
            if (!condition) throw new Exception($"FAIL {name}");
            checks++;
        }

        static Account Credit(int id, decimal? limit, bool active = true) => new()
        {
            AccountId = id,
            UserId = 7,
            Name = $"credit-{id}",
            IsCredit = true,
            CreditLimit = limit,
            Active = active
        };

        static Account Cash(int id) => new()
        {
            AccountId = id,
            UserId = 7,
            Name = $"cash-{id}",
            IsCredit = false
        };

        static AccountCreditInstallmentRow Installment(
            int installmentId,
            int accountId,
            string planType,
            string status,
            decimal totalDue,
            string? paymentStatus = null,
            decimal? allocated = null) => new()
        {
            InstallmentId = installmentId,
            AccountId = accountId,
            PlanType = planType,
            Status = status,
            TotalDue = totalDue,
            PaymentStatus = paymentStatus,
            AllocatedAmount = allocated
        };

        var owned = new[] { Credit(1, 1000m), Credit(2, 500m, active: false), Credit(3, null, active: false), Cash(4) };

        var rows = new[]
        {
            // Split canónico: Revolving y MSI pendientes se suman por separado.
            Installment(10, 1, "Revolving", "Open", 300m),
            Installment(11, 1, "MSI", "Open", 500m),
            // Una allocation Posted reduce una sola vez; el piso por installment evita negativos.
            Installment(12, 1, "Revolving", "PartiallyPaid", 200m, "Posted", 120m),
            Installment(13, 1, "MSI", "Open", 50m, "Posted", 999m),
            // Una allocation no-Posted no reduce deuda.
            Installment(14, 1, "Revolving", "Overdue", 90m, "Pending", 90m),
            // Un installment ya Paid queda fuera aunque TotalDue > 0.
            Installment(15, 1, "Revolving", "Paid", 400m),
            // Aislamiento por dueño: el installment de otra cuenta no entra.
            Installment(20, 99, "Revolving", "Open", 1000m),
            // Una cuenta de crédito inactiva conserva su snapshot.
            Installment(21, 2, "MSI", "Open", 125m),
            // Una cuenta de efectivo no participa del snapshot de crédito.
            Installment(22, 4, "Revolving", "Open", 700m)
        };

        var snapshots = AccountCreditSnapshotCalculator.Calculate(owned, rows);

        Check(snapshots.Count == 3, "Un snapshot por cuenta de crédito propia; efectivo excluido");
        Check(!snapshots.ContainsKey(4), "Una cuenta de efectivo nunca recibe snapshot de crédito");

        var account1 = snapshots[1];
        Check(account1.NormalOutstanding == 470m, "Normal = 300 + max(200-120,0) + 90 no-Posted; Paid excluido");
        Check(account1.MsiOutstanding == 500m, "MSI = 500 + max(50-999,0)");
        Check(account1.CurrentDebt == 970m, "CurrentDebt = normal + MSI");
        Check(account1.CreditAvailable == 30m, "Available = límite 1000 - deuda 970");

        var account2 = snapshots[2];
        Check(account2.MsiOutstanding == 125m && account2.NormalOutstanding == 0m && account2.CreditAvailable == 375m,
            "Una cuenta de crédito inactiva conserva su snapshot canónico");

        var account3 = snapshots[3];
        Check(account3.NormalOutstanding == 0m && account3.MsiOutstanding == 0m && account3.CurrentDebt == 0m,
            "Una cuenta de crédito sin installments reporta cero, no null");
        Check(account3.CreditAvailable is null, "Una cuenta de crédito sin límite reporta available null");

        var overLimit = AccountCreditSnapshotCalculator.Calculate(
            new[] { Credit(5, 100m) },
            new[] { Installment(30, 5, "Revolving", "Open", 250m) });
        Check(overLimit[5].CreditAvailable == -150m, "Available queda negativo cuando la deuda excede el límite");

        Console.WriteLine($"Account credit snapshot checks passed ({checks}).");
        return Task.CompletedTask;
    }
}
