using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    /// <summary>Desenlace tipado de un enlace manual partida ↔ transacción. Sin montos ni nombres.</summary>
    public enum BudgetItemLinkOutcomeStatus
    {
        /// <summary>La partida quedó <c>executed</c> y enlazada a la transacción.</summary>
        Linked = 0,

        /// <summary>La partida no existe o no pertenece al usuario.</summary>
        ItemNotFound = 1,

        /// <summary>La partida no está <c>pending</c> o ya tiene transacción enlazada.</summary>
        ItemNotLinkable = 2,

        /// <summary>La transacción no existe o no pertenece al usuario.</summary>
        TransactionNotFound = 3,

        /// <summary>Otra partida ya reclamó esa transacción.</summary>
        TransactionAlreadyLinked = 4,

        /// <summary>Mes, tipo o alcance no coinciden: el enlace es inválido, no un conflicto de estado.</summary>
        Mismatch = 5
    }

    /// <summary>Resultado de un enlace manual. Lleva ids, nunca montos ni nombres.</summary>
    public sealed class BudgetItemLinkOutcome
    {
        public BudgetItemLinkOutcomeStatus Status { get; set; }
        public int ItemId { get; set; }
        public int TransactionId { get; set; }

        public static BudgetItemLinkOutcome Of(BudgetItemLinkOutcomeStatus status, int itemId, int transactionId) => new()
        {
            Status = status,
            ItemId = itemId,
            TransactionId = transactionId
        };
    }

    /// <summary>
    /// Gasto candidato a enlazar con una partida: mismo mes y mismo alcance, sin importar el monto.
    /// El monto real es el que manda una vez enlazada. Lo devuelve
    /// <see cref="ITransactionCommandService.ListBudgetItemLinkCandidatesAsync"/>.
    /// </summary>
    public sealed class BudgetItemLinkCandidate
    {
        public int TransactionId { get; set; }
        public decimal Amount { get; set; }
        public DateTime TransactionDate { get; set; }
        public int? CategoryId { get; set; }
        public int? SubcategoryId { get; set; }
        public string? Description { get; set; }
    }

    public interface ITransactionCommandService
    {
        Task<Transaction> CreateIncomeAsync(Transaction transaction, int userId, IEnumerable<(int InstallmentId, decimal Amount)>? creditAllocations = null, IEnumerable<string>? tags = null);

        /// <summary>
        /// Alta de gasto. Con <paramref name="budgetItemId"/> la transacción se enlaza a esa partida
        /// <b>pending</b> del mismo mes y alcance: la elegibilidad se valida <b>antes</b> de escribir
        /// (entrada inválida = 400 sin efecto parcial) y el enlace se confirma <b>después</b> del
        /// commit, junto al matching automático pero sustituyéndolo por decisión explícita.
        /// </summary>
        Task<Transaction> CreateExpenseAsync(Transaction transaction, int userId, IEnumerable<ExpenseAllocationInput>? allocations = null, IEnumerable<string>? tags = null, int? msiMonths = null, int? budgetItemId = null);

        /// <summary>
        /// Enlace manual de una transacción existente a una partida <b>pending</b>: exige mismo mes,
        /// mismo tipo y mismo alcance, y admite cualquier monto. La fila se bloquea antes de leerla,
        /// así que dos enlaces concurrentes no pueden pisarse, y el índice único
        /// <c>uq_budget_items_transaction</c> cierra la carrera simétrica.
        /// </summary>
        Task<BudgetItemLinkOutcome> LinkBudgetItemAsync(int userId, int itemId, int transactionId, CancellationToken cancellationToken);

        /// <summary>
        /// Gastos del mes de la partida que comparten su alcance y no están enlazados a otra partida.
        /// <c>null</c> cuando la partida no existe o no es del usuario. Solo lectura.
        /// </summary>
        Task<IReadOnlyList<BudgetItemLinkCandidate>?> ListBudgetItemLinkCandidatesAsync(int userId, int itemId, CancellationToken cancellationToken);
        Task<(Transaction? Transaction, string? ErrorMessage)> UpdateTransactionWithDetailsForUserAsync(
            int id,
            int userId,
            Transaction transaction,
            IEnumerable<string>? tags,
            IEnumerable<ExpenseAllocationInput>? allocations,
            bool replaceAllocations);
        Task<bool> DeleteForUserAsync(int id, int userId);
    }
}
