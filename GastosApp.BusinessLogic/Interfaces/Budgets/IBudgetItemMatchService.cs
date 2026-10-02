using GastosApp.BusinessLogic.Models.Budgets;

namespace GastosApp.BusinessLogic.Interfaces
{
    /// <summary>
    /// Matching de partidas planificadas contra transacciones (sección 4.4 del plan). El alcance
    /// siempre se acota por el <c>userId</c> recibido del token.
    /// </summary>
    public interface IBudgetItemMatchService
    {
        /// <summary>
        /// Intenta cumplir con una transacción las partidas <c>pending</c> del usuario que complyan
        /// una <b>regla fuerte</b>, y enlaza la mejor. Se invoca <b>después</b> del commit del alta
        /// de la transacción: enlazar dentro de esa transacción convertiría un fallo de matching en
        /// un rollback del dinero.
        /// </summary>
        /// <remarks>
        /// <para><b>La regla fuerte escribe; la débil no.</b> Solo <see cref="BudgetItemMatchStrength.Strong"/>
        /// (mismo comercio con monto dentro de tolerancia, o misma cuenta + mismo scope + monto exacto)
        /// produce enlace, porque identifica el gasto con la partida. La
        /// <see cref="BudgetItemMatchStrength.Weak"/> (misma categoría/subcategoría en el mismo mes)
        /// es demasiado ambigua para mover un status por sí sola —varias partidas y varios gastos
        /// pueden compartir categoría— así que se limita a <see cref="SuggestAsync"/> y deja la
        /// decisión en el usuario. <b>La ventana (<c>planned_date</c> → fin de mes) es
        /// precondición de las dos</b>, también de la sugerencia: un cargo anterior a
        /// <c>planned_date</c> no se propone como posible cumplimiento de esa partida.</para>
        /// <para><b>Idempotente</b>: si la partida ya tiene <c>transaction_id</c>, o la transacción
        /// ya está enlazada a otra partida, no hace nada. Una violación de
        /// <c>uq_budget_items_transaction</c> se trata como carrera ya resuelta, no como error. El
        /// enlace toma un <b>candado de fila</b> antes de decidir, así que dos altas concurrentes
        /// sobre la misma partida no pueden enlazarse las dos: la segunda ve la fila ya enlazada.</para>
        /// <para><b>Excepción a la ventana</b> (sección 4.4 punto 4): una transacción que cae fuera
        /// de la ventana igual cumple su partida <c>pending</c> si el periodo de la partida ya está
        /// cerrado —el pago tardío real—, y ese mes pasa a <c>executed</c>. Es un ajuste de reporte,
        /// no de caja. <b>Sin tope de meses</b>: el plan no fija ninguno y sólo por <b>fuerza
        /// fuerte</b>, porque una partida pagada con dos meses de retraso no puede quedar
        /// <c>pending</c> para siempre. La excepción tampoco mueve el piso de la ventana
        /// (<c>planned_date</c>): un cargo anterior a la fecha planificada nunca es un pago
        /// tardío.</para>
        /// <para>Nunca lanza por una condición de negocio: devuelve un
        /// <see cref="BudgetItemMatchOutcome"/> para que el llamador pueda seguir sin costo.</para>
        /// </remarks>
        Task<BudgetItemMatchOutcome> TryMatchTransactionAsync(int appUserId, int transactionId, CancellationToken cancellationToken);

        /// <summary>
        /// Candidatas <b>débiles</b> de un periodo: partidas <c>pending</c> sin transacción enlazada
        /// cuya categoría/subcategoría aparece en algún gasto del mismo mes. <b>No escribe nada</b>:
        /// es la lista que la UI ofrece para que el usuario elija. Valida <c>yyyy-MM</c> y lanza
        /// <see cref="ArgumentException"/> si el periodo no tiene ese formato.
        /// </summary>
        Task<IReadOnlyList<BudgetItemSuggestion>> SuggestAsync(int appUserId, string period, CancellationToken cancellationToken);
    }
}
