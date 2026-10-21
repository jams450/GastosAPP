using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.BusinessLogic.Services;

namespace GastosApp.Dashboard.Tests;

/// <summary>
/// Pins the rule that every report reads the frozen MXN amount and never the nominal one: a movement
/// captured in a foreign currency is worth in pesos what was frozen with it at capture time.
/// <para>
/// These checks fail if the dashboard goes back to summing <c>Amount</c>. They are written with an
/// amount that differs from its consolidated value on purpose, because with data already in pesos
/// both numbers coincide and the regression would pass unnoticed.
/// </para>
/// </summary>
public static class DashboardFinancialSummaryTests
{
    private const decimal ForeignAmount = 100m;
    private const decimal FrozenRate = 17.25m;

    /// <summary>Consolidado esperado: 100 USD a 17.25 MXN por dólar.</summary>
    private const decimal Consolidated = ForeignAmount * FrozenRate;

    public static Task RunAsync()
    {
        var checks = 0;
        void Check(bool condition, string name)
        {
            if (!condition) throw new Exception($"FAIL {name}");
            checks++;
        }

        static bool Close(decimal a, decimal b) => Math.Abs(a - b) < 0.005m;

        // Una cuenta de efectivo (1) y una de crédito (2), para cubrir los dos acumuladores.
        var accounts = new Dictionary<int, bool> { [1] = false, [2] = true };

        var usdExpense = Row(1, TransactionDomainConstants.TransactionType.Expense, ForeignAmount, Consolidated);
        var expenseSummary = DashboardService.CalculateFinancialSummary(new[] { usdExpense }, accounts);
        Check(Close(expenseSummary.CashExpense, Consolidated), "Un gasto en USD aporta su importe consolidado al gasto del mes");
        Check(!Close(expenseSummary.CashExpense, ForeignAmount), "Un gasto en USD no se cuenta a su valor nominal");

        var usdCreditExpense = Row(2, TransactionDomainConstants.TransactionType.Expense, ForeignAmount, Consolidated);
        var creditSummary = DashboardService.CalculateFinancialSummary(new[] { usdCreditExpense }, accounts);
        Check(Close(creditSummary.CreditExpense, Consolidated), "Un gasto en USD en tarjeta aporta su consolidado");
        Check(!Close(creditSummary.CreditExpense, ForeignAmount), "Un gasto en USD en tarjeta no se cuenta a valor nominal");

        var usdIncome = Row(1, TransactionDomainConstants.TransactionType.Income, ForeignAmount, Consolidated);
        var incomeSummary = DashboardService.CalculateFinancialSummary(new[] { usdIncome }, accounts);
        Check(Close(incomeSummary.CashIncome, Consolidated), "Un ingreso en USD aporta su importe consolidado");
        Check(!Close(incomeSummary.CashIncome, ForeignAmount), "Un ingreso en USD no se cuenta a valor nominal");

        // En pesos ambos importes son el mismo por construcción: el caso de siempre no cambia.
        var mxnExpense = Row(1, TransactionDomainConstants.TransactionType.Expense, 500m, 500m);
        var mxnSummary = DashboardService.CalculateFinancialSummary(new[] { mxnExpense }, accounts);
        Check(Close(mxnSummary.CashExpense, 500m), "Un gasto en MXN conserva su importe");

        Console.WriteLine($"PASS {checks} currency consolidation outcomes");
        return Task.CompletedTask;
    }

    private static DashboardService.MonthTransactionRow Row(int accountId, string type, decimal amount, decimal amountMxn)
    {
        return new DashboardService.MonthTransactionRow
        {
            TransactionId = 1,
            AccountId = accountId,
            TransactionDate = new DateTime(2026, 10, 16, 18, 0, 0, DateTimeKind.Utc),
            Type = type,
            Amount = amount,
            AmountMxn = amountMxn,
            BalanceImpact = -amountMxn
        };
    }
}
