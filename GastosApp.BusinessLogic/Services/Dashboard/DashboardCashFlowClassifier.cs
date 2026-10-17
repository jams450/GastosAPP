using System;
using System.Collections.Generic;
using System.Linq;
using GastosApp.BusinessLogic.Models.Transactions;

namespace GastosApp.BusinessLogic.Services.Dashboard
{
    /// <summary>
    /// Contrato mínimo de un movimiento para clasificar el flujo de efectivo sin acoplarse a la
    /// entidad EF. La fila privada del resumen de <c>DashboardService</c> lo implementa para
    /// compartir la resolución de contrapartes entre el resumen heredado y el desglose nuevo.
    /// </summary>
    public interface IDashboardCashFlowTransaction
    {
        int TransactionId { get; }
        int AccountId { get; }
        string? Type { get; }
        decimal Amount { get; }
        decimal BalanceImpact { get; }
        string? Direction { get; }
        int? CounterpartyAccountId { get; }
        Guid? TransferGroupId { get; }
    }

    /// <summary>Movimiento concreto para pruebas y consumidores que no leen de EF.</summary>
    public sealed class DashboardCashFlowTransaction : IDashboardCashFlowTransaction
    {
        public int TransactionId { get; init; }
        public int AccountId { get; init; }
        public string? Type { get; init; }
        public decimal Amount { get; init; }
        public decimal BalanceImpact { get; init; }
        public string? Direction { get; init; }
        public int? CounterpartyAccountId { get; init; }
        public Guid? TransferGroupId { get; init; }
    }

    /// <summary>
    /// Desglose aditivo del efectivo del mes. Complementa los campos heredados
    /// (<c>MonthExpense</c>/<c>MonthNet</c>) en lugar de reemplazarlos, para no confundir un pago a
    /// tarjeta con consumo nuevo. Cada traspaso se cuenta una sola vez.
    /// </summary>
    public sealed class DashboardCashFlowBreakdown
    {
        /// <summary>Gasto directo en cuentas de efectivo, sin pagos a tarjeta.</summary>
        public decimal DirectExpense { get; private set; }

        /// <summary>Transferencias efectivo→crédito: salen de efectivo y reducen deuda, no son consumo.</summary>
        public decimal CardPayment { get; private set; }

        /// <summary>Traspasos efectivo→efectivo: mueven dinero entre cuentas propias, contados una vez.</summary>
        public decimal InternalCashTransfer { get; private set; }

        /// <summary>Salida total de efectivo = gasto directo + pagos a tarjeta.</summary>
        public decimal CashOutflow => DirectExpense + CardPayment;

        internal void AddDirectExpense(decimal amount) => DirectExpense += amount;
        internal void AddCardPayment(decimal amount) => CardPayment += amount;
        internal void AddInternalCashTransfer(decimal amount) => InternalCashTransfer += amount;
    }

    /// <summary>
    /// Clasifica movimientos del mes en gasto directo de efectivo, pagos a tarjeta y traspasos
    /// internos de efectivo. La resolución de contrapartes (par por <c>TransferGroupId</c> o fila
    /// única con <c>CounterpartyAccountId</c>) es la misma que usa el resumen heredado.
    /// </summary>
    public static class DashboardCashFlowClassifier
    {
        public static DashboardCashFlowBreakdown Classify<T>(
            IEnumerable<T> transactions,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
            where T : IDashboardCashFlowTransaction
        {
            var transactionList = transactions.ToList();
            var breakdown = new DashboardCashFlowBreakdown();

            foreach (var transaction in transactionList)
            {
                if (!IsTransferType(transaction, TransactionDomainConstants.TransactionType.Expense) ||
                    !accountCreditTypes.TryGetValue(transaction.AccountId, out var isCredit) ||
                    isCredit)
                {
                    continue;
                }

                breakdown.AddDirectExpense(transaction.Amount);
            }

            var pairedTransferIds = new HashSet<int>();
            foreach (var transferGroup in transactionList
                         .Where(t => IsTransferType(t, TransactionDomainConstants.TransactionType.Transfer) && t.TransferGroupId.HasValue)
                         .GroupBy(t => t.TransferGroupId)
                         .Where(g => g.Count() == 2))
            {
                var pair = transferGroup.ToList();
                pairedTransferIds.UnionWith(pair.Select(t => t.TransactionId));

                if (!TryResolveEndpoints(pair[0], pair[1], out var sourceAccountId, out var destinationAccountId, out var amount))
                {
                    continue;
                }

                ApplyTransfer(breakdown, sourceAccountId, destinationAccountId, amount, accountCreditTypes);
            }

            foreach (var transaction in transactionList.Where(t =>
                         IsTransferType(t, TransactionDomainConstants.TransactionType.Transfer) &&
                         !pairedTransferIds.Contains(t.TransactionId)))
            {
                if (!TryResolveEndpoints(transaction, out var sourceAccountId, out var destinationAccountId, out var amount))
                {
                    continue;
                }

                ApplyTransfer(breakdown, sourceAccountId, destinationAccountId, amount, accountCreditTypes);
            }

            return breakdown;
        }

        private static void ApplyTransfer(
            DashboardCashFlowBreakdown breakdown,
            int sourceAccountId,
            int destinationAccountId,
            decimal amount,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            if (!accountCreditTypes.TryGetValue(sourceAccountId, out var sourceIsCredit) ||
                !accountCreditTypes.TryGetValue(destinationAccountId, out var destinationIsCredit))
            {
                return;
            }

            if (!sourceIsCredit && destinationIsCredit)
            {
                // Efectivo→crédito: pago a tarjeta. Sale de efectivo y reduce deuda, no es consumo.
                breakdown.AddCardPayment(amount);
            }
            else if (!sourceIsCredit && !destinationIsCredit)
            {
                // Efectivo→efectivo: sólo mueve dinero entre cuentas propias, contado una vez.
                breakdown.AddInternalCashTransfer(amount);
            }
            // Crédito→efectivo (adelanto) y crédito→crédito no son salida de efectivo: se ignoran.
        }

        /// <summary>
        /// Resuelve origen/destino de un traspaso registrado como par (dos filas con el mismo
        /// <c>TransferGroupId</c>). Devuelve <c>false</c> sólo si no hay datos suficientes.
        /// </summary>
        public static bool TryResolveEndpoints<T>(
            T first,
            T second,
            out int sourceAccountId,
            out int destinationAccountId,
            out decimal amount)
            where T : IDashboardCashFlowTransaction
        {
            T source;
            T destination;

            if (first.BalanceImpact < 0)
            {
                source = first;
                destination = second;
            }
            else if (second.BalanceImpact < 0)
            {
                source = second;
                destination = first;
            }
            else if (first.BalanceImpact > 0)
            {
                source = second;
                destination = first;
            }
            else if (second.BalanceImpact > 0)
            {
                source = first;
                destination = second;
            }
            else
            {
                source = first.TransactionId < second.TransactionId ? first : second;
                destination = ReferenceEquals(source, first) ? second : first;
            }

            sourceAccountId = source.AccountId;
            destinationAccountId = destination.AccountId;
            amount = source.Amount;
            return true;
        }

        /// <summary>
        /// Resuelve origen/destino de una fila única con <c>CounterpartyAccountId</c>. Devuelve
        /// <c>false</c> cuando la fila no tiene contraparte o no hay impacto/dirección que la oriente.
        /// </summary>
        public static bool TryResolveEndpoints<T>(
            T transaction,
            out int sourceAccountId,
            out int destinationAccountId,
            out decimal amount)
            where T : IDashboardCashFlowTransaction
        {
            sourceAccountId = 0;
            destinationAccountId = 0;
            amount = 0m;

            if (!transaction.CounterpartyAccountId.HasValue)
            {
                return false;
            }

            if (transaction.BalanceImpact < 0 ||
                (transaction.BalanceImpact == 0 && string.Equals(transaction.Direction, TransactionDomainConstants.Direction.Debit, StringComparison.OrdinalIgnoreCase)))
            {
                sourceAccountId = transaction.AccountId;
                destinationAccountId = transaction.CounterpartyAccountId.Value;
            }
            else if (transaction.BalanceImpact > 0 ||
                     (transaction.BalanceImpact == 0 && string.Equals(transaction.Direction, TransactionDomainConstants.Direction.Credit, StringComparison.OrdinalIgnoreCase)))
            {
                sourceAccountId = transaction.CounterpartyAccountId.Value;
                destinationAccountId = transaction.AccountId;
            }
            else
            {
                // Fila legacy sin impacto ni dirección: requiere el par por TransferGroupId.
                return false;
            }

            amount = transaction.Amount;
            return true;
        }

        private static bool IsTransferType<T>(T transaction, string expected)
            where T : IDashboardCashFlowTransaction
        {
            return string.Equals(transaction.Type, expected, StringComparison.OrdinalIgnoreCase);
        }
    }
}
