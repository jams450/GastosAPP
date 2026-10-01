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
    /// </remarks>
    public sealed class BudgetEvaluationSettings
    {
        public bool CommittedCountsEnabled { get; init; }
    }
}
