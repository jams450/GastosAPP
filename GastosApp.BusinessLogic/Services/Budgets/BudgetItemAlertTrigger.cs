using System.Globalization;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// Tabla ejecutable de las alertas de partida planificada (plan §6.1 y §6.2): qué dispara cada
    /// tipo y con qué texto. Es una función pura a propósito — sin reloj, sin base de datos y sin
    /// opciones — porque la tabla del plan es una regla de calendario y las tres filas se evalúan
    /// <b>de forma independiente</b> en el mismo ciclo.
    /// </summary>
    /// <remarks>
    /// Independencia que la unicidad sostiene: el último día del mes una partida <c>pending</c> con
    /// fecha vencida produce <c>overdue</c> <b>y</b> <c>unexecuted_month_end</c> en la misma corrida
    /// (criterios 47 y 48: tres filas de outbox por partida y periodo, ninguna descartada). Un
    /// <c>else if</c> sería una cobertura más barata y silenciosamente incompleta.
    /// </remarks>
    public static class BudgetItemAlertTrigger
    {
        /// <summary>
        /// Tipos de alerta que le corresponden a una partida <c>pending</c> en la corrida de hoy, en
        /// orden estable (<c>due_today</c>, <c>overdue</c>, <c>unexecuted_month_end</c>). El
        /// filtro por estado no vive aquí: el recorrido ya trae solo partidas <c>pending</c>, y
        /// <c>executed</c>/<c>ignored</c>/<c>cancelled</c> no generan ninguna de las tres.
        /// </summary>
        /// <param name="plannedDate">Fecha esperada de la partida (<c>budget_items.planned_date</c>).</param>
        /// <param name="today">Fecha local de hoy en America/Mexico_City, no UTC crudo.</param>
        /// <param name="evaluationPeriodKey">
        /// Periodo (<c>yyyy-MM</c>) que está evaluando el llamador. Se recibe <b>explícito</b> y no
        /// se deduce de <paramref name="today"/> a propósito: lo aporta el evaluador y es la misma
        /// identidad que usa <c>budget_items.period_key</c>. Recibirlo aparte mantiene la función
        /// pura y sin reloj, y deja la coherencia entre periodo y fecha en el llamador — que es
        /// quien conoce ambos.</param>
        /// <param name="isLastDayOfMonth">Si hoy es el último día del periodo vigente.</param>
        /// <remarks>
        /// Esta clase es la tabla del plan y nada más: <b>no conoce interruptores</b>. El corte por
        /// <c>Alerts:UnexecutedAlertEnabled</c> (default <c>false</c>; §6.4 regla 4, "las alertas de
        /// partida nacen apagadas") lo aplica el evaluador <b>antes de recorrer partidas</b>, porque
        /// apaga <b>las tres</b> y no solo el cierre de mes. Un gate aquí únicamente sobre
        /// <c>unexecuted_month_end</c> dejaría que un despliegue existente empezara a recibir
        /// <c>due_today</c> y <c>overdue</c> sin tocar configuración, que es justo lo que §6.2
        /// prohíbe.
        /// </remarks>
        public static IReadOnlyList<string> ResolveKinds(
            DateOnly plannedDate,
            DateOnly today,
            string evaluationPeriodKey,
            bool isLastDayOfMonth)
        {
            var kinds = new List<string>(3);

            // "El día planned_date, si sigue pending".
            if (plannedDate == today)
            {
                kinds.Add(BudgetItemAlertKind.DueToday);
            }

            // "Primer ciclo posterior a planned_date, dentro del mes, si sigue pending" (§6.2). Las
            // dos mitades se acotan aquí y no en el recorrido, para que la regla no dependa del
            // llamador: planned_date < today descarta una fecha futura (una partida programada para
            // mañana no está atrasada, aunque su periodo sea el evaluado) y el mismo periodo
            // descarta la vencida de otro mes, que es lo que "dentro del mes" significa en el plan
            // y no un alias de "anterior a hoy". Estrictamente menor y no menor o igual: el día del
            // vencimiento solo produce due_today, y el primer ciclo posterior es el de overdue.
            //
            // El mismo periodo se comprueba DOS veces —contra la fecha planificada y contra hoy—
            // porque el plan dice "dentro del mes": si hoy ya no pertenece al periodo evaluado, la
            // evaluación no puede producir un aviso de ese periodo. Así la función es correcta por
            // sí sola y no depende de que el llamador le pase un periodo coherente con su reloj.
            if (plannedDate < today && IsSamePeriod(plannedDate, evaluationPeriodKey) && IsSamePeriod(today, evaluationPeriodKey))
            {
                kinds.Add(BudgetItemAlertKind.Overdue);
            }

            // "Último día del mes, si sigue pending". Sin condición sobre planned_date, tal como
            // está escrita la tabla del plan: una partida que vence el 30 y sigue pendiente el 31
            // cerró el mes sin ejecutarse.
            if (isLastDayOfMonth)
            {
                kinds.Add(BudgetItemAlertKind.UnexecutedMonthEnd);
            }

            return kinds;
        }

        /// <summary>
        /// Mismo periodo (<c>yyyy-MM</c>) que el que evalúa el llamador. Compara la identidad que ya
        /// usa la columna y no una aritmética de meses: <c>2026-09</c> y <c>2026-10</c> son periodos
        /// distintos aunque uno sea "el mes anterior" del otro.
        /// </summary>
        private static bool IsSamePeriod(DateOnly plannedDate, string evaluationPeriodKey) =>
            string.Equals(
                plannedDate.ToString("yyyy-MM", CultureInfo.InvariantCulture),
                evaluationPeriodKey,
                StringComparison.Ordinal);

        /// <summary>
        /// Texto exacto de la tabla §6.2. <paramref name="amount"/> se renderiza con el mismo
        /// formato de dinero del resto de la aplicación (<c>$1,500.00</c>). El texto se congela al
        /// encolar y nunca se registra: es dato financiero.
        /// </summary>
        public static string BuildPayload(string alertKind, string name, decimal amount) => alertKind switch
        {
            BudgetItemAlertKind.DueToday =>
                string.Create(CultureInfo.InvariantCulture, $"Hoy vence *{name}*: ${amount:N2}"),
            BudgetItemAlertKind.Overdue =>
                string.Create(CultureInfo.InvariantCulture, $"Sigue sin ejecutarse *{name}*: ${amount:N2}"),
            BudgetItemAlertKind.UnexecutedMonthEnd =>
                string.Create(CultureInfo.InvariantCulture, $"*{name}* cerró el mes sin ejecutarse: ${amount:N2}"),
            _ => throw new ArgumentException("alertKind must be one of: due_today, overdue, unexecuted_month_end.", nameof(alertKind))
        };

        /// <summary>
        /// Clave de idempotencia del outbox: <c>{period_key}:{alert_kind}</c> (§6.4 regla 1). Es el
        /// discriminador que sostiene las varias filas por partida y periodo; cabe en
        /// <c>varchar(30)</c> porque el tipo más largo es <c>unexecuted_month_end</c> (7 + 1 + 20 = 28).
        /// </summary>
        public static string BuildSourceKey(string periodKey, string alertKind) => $"{periodKey}:{alertKind}";
    }
}