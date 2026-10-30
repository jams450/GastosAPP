namespace GastosApp.API.Services.Jobs;

/// <summary>
/// Las cinco claves estables de los jobs que la API ya ejecutaba (L5). Es la única fuente de claves:
/// ni la ruta HTTP ni el cuerpo de una petición pueden inventar una.
/// <para>
/// Son valores persistidos en <c>job_runs.job_key</c> y leídos por la pantalla de administración, así
/// que renombrar uno parte el historial en dos. Agregar un job es agregar una clave aquí y su
/// adaptador en el contenedor; no requiere migración.
/// </para>
/// </summary>
public static class JobKeys
{
    /// <summary>Pase diario de etiquetado del correo. Espera antes de su primera corrida.</summary>
    public const string EmailIngest = "email_ingest";

    /// <summary>Sincronización de tipos de cambio. Corre al arrancar y luego a diario.</summary>
    public const string FxRateSync = "fx_rate_sync";

    /// <summary>Motor de gastos programados. Arranca y corre cada <c>Alerts:EvaluationIntervalMinutes</c>.</summary>
    public const string RecurringExecution = "recurring_execution";

    /// <summary>Evaluación de alertas de presupuesto y de partida. Misma cadencia que el motor.</summary>
    public const string AlertEvaluation = "alert_evaluation";

    /// <summary>Drenaje del outbox de alertas. Arranca y corre cada <c>Alerts:DispatchSeconds</c>.</summary>
    public const string AlertDispatch = "alert_dispatch";

    public static IReadOnlyList<string> All { get; } = new[]
    {
        EmailIngest,
        FxRateSync,
        RecurringExecution,
        AlertEvaluation,
        AlertDispatch
    };
}
