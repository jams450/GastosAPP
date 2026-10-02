namespace GastosApp.BusinessLogic.Models.Budgets
{
    /// <summary>
    /// Ajuste del matching de partidas. Se inyecta como POCO inmutable para no introducir
    /// <c>IOptions</c> en BusinessLogic, que hoy no lo usa: mismo criterio que
    /// <see cref="BudgetEvaluationSettings"/> y que <c>RecurringItemSettings</c>.
    /// </summary>
    /// <remarks>
    /// <para><see cref="MatchTolerancePct"/> (<c>Plan:MatchTolerancePct</c>, default <c>0</c>) es la
    /// tolerancia de monto del auto-match fuerte por comercio (sección 4.4 punto 1). <c>0</c> =
    /// coincidencia exacta, que es el valor que el propio plan propone (pendiente 10: "definir la
    /// tolerancia de monto del auto-match (propuesto: exacta, 0%)").</para>
    /// <para>Solo afecta a la rama de <b>comercio</b>. La rama fuerte por cuenta + alcance pide
    /// monto exacto en el plan y se mantiene exacta, para que subir la tolerancia no convierta un
    /// cruce de cuenta en un enlace automático más laxo.</para>
    /// <para>No se sobrescribe en <c>appsettings.*</c>: el default <c>0</c> es el comportamiento
    /// correcto y documentado, y dejar la clave ausente hace imposible un valor heredado por error.</para>
    /// </remarks>
    public sealed class PlanMatchSettings
    {
        /// <summary>
        /// <c>Plan:MatchTolerancePct</c>. Margen porcentual sobre el monto planificado que se acepta
        /// en la regla fuerte por comercio. Negativo se trata como 0.
        /// </summary>
        public decimal MatchTolerancePct { get; init; }
    }
}
