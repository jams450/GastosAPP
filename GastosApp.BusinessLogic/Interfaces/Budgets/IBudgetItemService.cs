using GastosApp.BusinessLogic.Models.Budgets;

namespace GastosApp.BusinessLogic.Interfaces
{
    /// <summary>
    /// Partidas planificadas de un periodo: CRUD, validación de scope por <c>kind</c>, cancelación
    /// y transición de estado. El alcance siempre se acota por el <c>userId</c> del token.
    /// </summary>
    public interface IBudgetItemService
    {
        /// <summary>Partidas del periodo con filtros opcionales. <c>periodKey</c> null => mes actual.</summary>
        Task<IReadOnlyList<BudgetItemListItem>> ListAsync(int userId, BudgetItemQuery query);

        /// <summary>Partida propia. Null cuando no existe o no pertenece al usuario.</summary>
        Task<BudgetItemListItem?> GetAsync(int itemId, int userId);

        /// <summary>
        /// Alta de una partida. Sin <c>recurringItemId</c> es manual (<c>source=manual</c>); con
        /// <c>recurringItemId</c> es selectiva desde plantilla (<c>source=template</c>, ligada por
        /// FK, monto y fecha derivados). El periodo se deriva de <c>plannedDate</c> en ambos casos.
        /// </summary>
        Task<BudgetItemListItem> CreateAsync(int userId, BudgetItemWriteInput input);

        /// <summary>Edición. Null cuando no existe o no es del usuario. <c>kind</c> es inmutable.</summary>
        Task<BudgetItemListItem?> UpdateAsync(int itemId, int userId, BudgetItemWriteInput input);

        /// <summary>Soft-delete: pasa la partida a <c>cancelled</c> y libera su monto.</summary>
        Task<bool> CancelAsync(int itemId, int userId);

        /// <summary>
        /// Transición manual de estado. <c>executed</c> exige que la partida ya tenga transacción
        /// enlazada; <c>cancelled</c> solo se alcanza por <see cref="CancelAsync"/>.
        /// </summary>
        Task<BudgetItemListItem?> SetStatusAsync(int itemId, int userId, string status);

        /// <summary>
        /// Borrado duro de las partidas <c>cancelled</c> del periodo. Solo periodos abiertos;
        /// un periodo cerrado es un conflicto. Devuelve el número de partidas borradas.
        /// </summary>
        Task<int> PurgeCancelledAsync(int userId, string? periodKey);
    }
}
