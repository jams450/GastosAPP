using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.BusinessLogic.Services.Dashboard;

namespace GastosApp.Dashboard.Tests;

/// <summary>
/// Cobertura determinista del desglose aditivo de efectivo: gasto directo, pagos efectivo→crédito
/// y traspasos efectivo→efectivo contados una sola vez. Sin EF, sin reloj y sin base de datos; sólo
/// se ejecuta la clasificación pura sobre movimientos explícitos. El resumen heredado
/// (MonthExpense/MonthNet) no se toca: estas pruebas protegen su semántica a través del desglose.
/// </summary>
public static class CashFlowClassificationTests
{
    public static Task RunAsync()
    {
        var checks = 0;
        var failures = new List<string>();
        void Check(bool condition, string name)
        {
            if (condition)
            {
                checks++;
                return;
            }

            failures.Add(name);
        }

        static bool Close(decimal actual, decimal expected) => Math.Abs(actual - expected) < 0.005m;

        // Cuentas 1 y 2 de efectivo, 9 de crédito.
        var creditTypes = new Dictionary<int, bool> { [1] = false, [2] = false, [9] = true };

        // Regla 1: el gasto directo de efectivo excluye pagos a tarjeta y gastos de crédito.
        {
            var cashExpense = ExpenseRow(1, accountId: 1, amount: 150m);
            var creditExpense = ExpenseRow(2, accountId: 9, amount: 999m);
            var cardPaymentPair = PairedTransfer(10, sourceAccountId: 1, destinationAccountId: 9, amount: 300m, Guid.NewGuid());
            var breakdown = DashboardCashFlowClassifier.Classify(
                new[] { cashExpense, creditExpense, cardPaymentPair[0], cardPaymentPair[1] },
                creditTypes);

            Check(Close(breakdown.DirectExpense, 150m),
                "El gasto directo de efectivo no incluye el pago a tarjeta ni el gasto de crédito");
            Check(Close(breakdown.CardPayment, 300m),
                "La transferencia efectivo→crédito se clasifica como pago a tarjeta, no como gasto directo");
        }

        // Regla 2: un pago efectivo→crédito se cuenta una sola vez, tanto por par como por fila única.
        {
            var paired = PairedTransfer(20, sourceAccountId: 1, destinationAccountId: 9, amount: 300m, Guid.NewGuid());
            var pairedBreakdown = DashboardCashFlowClassifier.Classify(paired, creditTypes);

            var single = SingleTransfer(30, accountId: 1, counterpartyAccountId: 9, amount: 300m, impact: -300m, direction: TransactionDomainConstants.Direction.Debit);
            var singleBreakdown = DashboardCashFlowClassifier.Classify(new[] { single }, creditTypes);

            Check(Close(pairedBreakdown.CardPayment, 300m) && Close(pairedBreakdown.DirectExpense, 0m),
                "El par efectivo→crédito se cuenta una vez como pago a tarjeta");
            Check(Close(singleBreakdown.CardPayment, 300m) && Close(singleBreakdown.DirectExpense, 0m),
                "La fila única efectivo→crédito se cuenta una vez como pago a tarjeta");
            Check(Close(pairedBreakdown.CashOutflow, singleBreakdown.CashOutflow),
                "Ambas rutas de contraparte producen la misma salida de efectivo");
        }

        // Regla 3: un traspaso efectivo→efectivo se cuenta una sola vez y no es salida de efectivo.
        {
            var paired = PairedTransfer(40, sourceAccountId: 1, destinationAccountId: 2, amount: 200m, Guid.NewGuid());
            var pairedBreakdown = DashboardCashFlowClassifier.Classify(paired, creditTypes);

            var single = SingleTransfer(50, accountId: 1, counterpartyAccountId: 2, amount: 200m, impact: -200m, direction: TransactionDomainConstants.Direction.Debit);
            var singleBreakdown = DashboardCashFlowClassifier.Classify(new[] { single }, creditTypes);

            Check(Close(pairedBreakdown.InternalCashTransfer, 200m) && Close(pairedBreakdown.DirectExpense, 0m) && Close(pairedBreakdown.CardPayment, 0m),
                "El par efectivo→efectivo sólo mueve dinero y se cuenta una vez");
            Check(Close(singleBreakdown.InternalCashTransfer, 200m) && Close(singleBreakdown.DirectExpense, 0m) && Close(singleBreakdown.CardPayment, 0m),
                "La fila única efectivo→efectivo sólo mueve dinero y se cuenta una vez");
            Check(Close(pairedBreakdown.CashOutflow, 0m) && Close(singleBreakdown.CashOutflow, 0m),
                "Mover efectivo entre cuentas propias no incrementa la salida de efectivo");
        }

        // Preserva: adelantos crédito→efectivo y traspasos crédito→crédito no alteran el flujo de efectivo.
        {
            var advance = PairedTransfer(60, sourceAccountId: 9, destinationAccountId: 1, amount: 500m, Guid.NewGuid());
            var advanceBreakdown = DashboardCashFlowClassifier.Classify(advance, creditTypes);

            var creditToCreditTypes = new Dictionary<int, bool> { [8] = true, [9] = true };
            var creditToCredit = PairedTransfer(70, sourceAccountId: 9, destinationAccountId: 8, amount: 100m, Guid.NewGuid());
            var creditToCreditBreakdown = DashboardCashFlowClassifier.Classify(creditToCredit, creditToCreditTypes);

            Check(Close(advanceBreakdown.DirectExpense, 0m) && Close(advanceBreakdown.CardPayment, 0m) && Close(advanceBreakdown.InternalCashTransfer, 0m) && Close(advanceBreakdown.CashOutflow, 0m),
                "El adelanto crédito→efectivo sigue sin ser salida de efectivo");
            Check(Close(creditToCreditBreakdown.CashOutflow, 0m) && Close(creditToCreditBreakdown.InternalCashTransfer, 0m),
                "Un traspaso crédito→crédito se ignora en el flujo de efectivo");
        }

        // Preserva: un par sin impacto/dirección se orienta por TransactionId (semántica heredada).
        {
            var zeroImpactCashSource = PairedTransfer(80, sourceAccountId: 1, destinationAccountId: 9, amount: 300m, Guid.NewGuid(), sourceImpact: 0m, destinationImpact: 0m);
            var cashSourceBreakdown = DashboardCashFlowClassifier.Classify(zeroImpactCashSource, creditTypes);

            var zeroImpactCreditSource = PairedTransfer(80, sourceAccountId: 9, destinationAccountId: 1, amount: 300m, Guid.NewGuid(), sourceImpact: 0m, destinationImpact: 0m);
            var creditSourceBreakdown = DashboardCashFlowClassifier.Classify(zeroImpactCreditSource, creditTypes);

            Check(Close(cashSourceBreakdown.CashOutflow, 300m),
                "Sin impacto, el id menor define el origen de efectivo y la salida se conserva");
            Check(Close(creditSourceBreakdown.CashOutflow, 0m),
                "Sin impacto, el id menor define el origen de crédito y no hay salida de efectivo");
        }

        if (failures.Count > 0)
        {
            throw new Exception($"FAIL {failures.Count} cash flow classification check(s): {string.Join(" | ", failures)}");
        }

        Console.WriteLine($"PASS {checks} cash flow classification outcomes");
        return Task.CompletedTask;
    }

    private static DashboardCashFlowTransaction ExpenseRow(int transactionId, int accountId, decimal amount) => new()
    {
        TransactionId = transactionId,
        AccountId = accountId,
        Type = TransactionDomainConstants.TransactionType.Expense,
        Amount = amount,
        BalanceImpact = -amount,
        Direction = TransactionDomainConstants.Direction.Debit
    };

    private static DashboardCashFlowTransaction[] PairedTransfer(
        int baseTransactionId,
        int sourceAccountId,
        int destinationAccountId,
        decimal amount,
        Guid transferGroupId,
        decimal? sourceImpact = null,
        decimal? destinationImpact = null) =>
    [
        new DashboardCashFlowTransaction
        {
            TransactionId = baseTransactionId,
            AccountId = sourceAccountId,
            Type = TransactionDomainConstants.TransactionType.Transfer,
            Amount = amount,
            BalanceImpact = sourceImpact ?? -amount,
            TransferGroupId = transferGroupId
        },
        new DashboardCashFlowTransaction
        {
            TransactionId = baseTransactionId + 1,
            AccountId = destinationAccountId,
            Type = TransactionDomainConstants.TransactionType.Transfer,
            Amount = amount,
            BalanceImpact = destinationImpact ?? amount,
            TransferGroupId = transferGroupId
        }
    ];

    private static DashboardCashFlowTransaction SingleTransfer(
        int transactionId,
        int accountId,
        int counterpartyAccountId,
        decimal amount,
        decimal impact,
        string? direction) => new()
    {
        TransactionId = transactionId,
        AccountId = accountId,
        Type = TransactionDomainConstants.TransactionType.Transfer,
        Amount = amount,
        BalanceImpact = impact,
        Direction = direction,
        CounterpartyAccountId = counterpartyAccountId
    };
}
