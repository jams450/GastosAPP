using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.BusinessLogic.Models.Recurring;

namespace GastosApp.BusinessLogic.Interfaces
{
    /// <summary>
    /// Catálogo de gastos e ingresos programados. El alcance siempre se acota por el <c>userId</c>
    /// recibido del token: nunca se confía en ids del payload. Las plantillas <c>average</c> no
    /// declaran monto; su importe se deriva del historial ejecutado.
    /// </summary>
    public interface IRecurringItemService
    {
        Task<IReadOnlyList<RecurringItemDetail>> ListAsync(int userId, RecurringItemQuery query);

        /// <summary>Plantilla propia. Null cuando no existe o no pertenece al usuario (404, nunca 403).</summary>
        Task<RecurringItemDetail?> GetAsync(int recurringItemId, int userId);

        Task<RecurringItemDetail> CreateAsync(int userId, RecurringItemWriteInput input);

        /// <summary>Edición. Null cuando no existe o no es del usuario. <c>kind</c> es inmutable.</summary>
        Task<RecurringItemDetail?> UpdateAsync(int recurringItemId, int userId, RecurringItemWriteInput input);

        /// <summary>Activa o desactiva la plantilla. Desactivar detiene el motor en el próximo ciclo.</summary>
        Task<RecurringItemDetail?> SetActiveAsync(int recurringItemId, int userId, bool active);

        /// <summary>
        /// Propone (o crea, con <c>dryRun=false</c>) una plantilla a partir de una transacción
        /// existente del propio usuario. Rechaza transferencias y deriva el inicio al mes siguiente.
        /// </summary>
        Task<RecurringItemFromTransactionResult> CreateFromTransactionAsync(
            int userId,
            int transactionId,
            bool dryRun);

        /// <summary>Disponibilidad de la salida de Telegram, sin exponer token ni <c>chat_id</c>.</summary>
        RecurringItemConfigResult GetConfig();

        /// <summary>
        /// Materializa las ocurrencias del periodo <b>en curso</b> que todavía no existan y ejecuta
        /// las que ya vencieron. Idempotente: repetir la corrida no duplica partidas ni transacciones.
        /// </summary>
        Task<RecurringExecutionResult> ExecuteDueAsync(
            int userId,
            DateTime? nowUtc = null,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Resuelve la ocurrencia de una plantilla propia en un periodo: valida propiedad,
        /// vigencia y monto, y deriva fecha e importe con las mismas reglas que el materializador.
        /// Es la única vía del alta selectiva (<c>BudgetItemService.CreateAsync</c> con
        /// <c>recurringItemId</c>); el materializador masivo y el rollover no cambian.
        /// Lanza <see cref="ArgumentException"/> (400) cuando la plantilla no existe, está
        /// inactiva, no aplica al periodo o su monto promedio no tiene historial que promediar.
        /// </summary>
        Task<RecurringTemplateOccurrence> ResolveOccurrenceAsync(
            int userId,
            int recurringItemId,
            string periodKey,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Crea las partidas del periodo a partir de las plantillas vigentes. Idempotente por
        /// <c>(user_id, period_key, kind, name)</c>. No ejecuta ni crea transacciones.
        /// </summary>
        Task<RecurringMaterializationResult> MaterializeAsync(
            int userId,
            string periodKey,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Rollover de plan entre dos periodos: clona presupuestos y materializa partidas según el
        /// modo, sin duplicar nada. Con <c>dryRun</c> devuelve los mismos conteos sin escribir.
        /// </summary>
        Task<BudgetRolloverResult> RolloverAsync(int userId, BudgetRolloverInput input);
    }
}
