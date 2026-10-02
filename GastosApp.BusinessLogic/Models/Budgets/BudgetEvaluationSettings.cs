namespace GastosApp.BusinessLogic.Models.Budgets
{
    /// <summary>
    /// Interruptor de evaluación de presupuesto. Se inyecta como POCO para no introducir
    /// <c>IOptions</c> en BusinessLogic, que hoy no lo usa.
    /// </summary>
    /// <remarks>
    /// <see cref="CommittedCountsEnabled"/> (<c>Alerts:CommittedCountsEnabled</c>, default <c>false</c>)
    /// decide qué compone el <b>umbral</b>: con <c>true</c>, el comprometido (<c>committed</c>) empuja
    /// el porcentaje que dispara alertas; con <c>false</c>, el umbral vuelve a depender solo del gasto
    /// ejecutado y el comportamiento de Fase 2 queda idéntico aunque existan partidas planificadas.
    /// No decide qué se muestra: el desglose (<c>spentPercent</c> + <c>committedPercent</c>) siempre
    /// viaja en la respuesta.
    /// <para>
    /// <see cref="UnexecutedAlertEnabled"/> (<c>Alerts:UnexecutedAlertEnabled</c>, default <c>false</c>)
    /// apaga la evaluación de partidas <b>completa</b> —<c>due_today</c>, <c>overdue</c> y
    /// <c>unexecuted_month_end</c>— (plan §6.2 y §6.4 regla 4). El nombre de la clave es el histórico
    /// que el plan fija literal; el alcance es el que dice §6.2, donde las tres alertas "nacen detrás"
    /// de esta misma clave. El corte lo hace el evaluador antes de recorrer partidas, no el resolver
    /// puro de tipos, que no conoce interruptores. Con el interruptor en <c>false</c> —el estado de
    /// entrega— el comportamiento previo queda intacto: no se lee ninguna partida ni se encola
    /// ninguna de las tres alertas.
    /// </para>
    /// </remarks>
    public sealed class BudgetEvaluationSettings
    {
        public bool CommittedCountsEnabled { get; init; }

        /// <summary>
        /// Al aparse, no se evalúa ninguna partida planificada y por tanto no se emite ninguna de las
        /// tres alertas: ni <c>due_today</c>, ni <c>overdue</c>, ni <c>unexecuted_month_end</c>. No
        /// afecta al camino de umbrales.
        /// </summary>
        public bool UnexecutedAlertEnabled { get; init; }
    }
}
