namespace GastosApp.BusinessLogic.Models.Accounts
{
    /// <summary>
    /// Agregado mensual de una sola cuenta para un año calendario. Los límites de mes se anclan en
    /// la zona horaria por defecto (America/Mexico_City), igual que dashboard y presupuestos.
    /// Las transferencias sólo se reflejan en <see cref="AccountAnnualSummaryMonth.NetTransfers"/>;
    /// nunca se suman como ingreso ni gasto.
    /// </summary>
    public class AccountAnnualSummary
    {
        public int AccountId { get; set; }
        public int Year { get; set; }

        /// <summary>Saldo inicial + movimientos confirmados anteriores al 1 de enero del año.</summary>
        public decimal OpeningBalance { get; set; }

        public List<AccountAnnualSummaryMonth> Months { get; set; } = [];

        public decimal YearIncome { get; set; }
        public decimal YearExpense { get; set; }
        public decimal YearNetTransfers { get; set; }

        /// <summary>Saldo de cierre del año: incluye transferencias y meses sin movimientos.</summary>
        public decimal ClosingBalance { get; set; }
    }

    public class AccountAnnualSummaryMonth
    {
        /// <summary>Mes calendario 1..12.</summary>
        public int Month { get; set; }

        public decimal Income { get; set; }
        public decimal Expense { get; set; }
        public decimal NetTransfers { get; set; }

        /// <summary>
        /// Saldo acumulado al cierre del mes. Un mes sin movimientos conserva el saldo anterior,
        /// no se reporta como cero.
        /// </summary>
        public decimal ClosingBalance { get; set; }
    }
}
