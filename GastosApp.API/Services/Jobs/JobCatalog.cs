using GastosApp.API.Configuration;
using GastosApp.API.Services.Email;
using GastosApp.API.Services.Fx;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Jobs;

/// <summary>
/// Forma del horario de un job, para que la pantalla de administración lo describa sin adivinar.
/// </summary>
/// <param name="Kind">
/// <c>daily</c>: espera la hora y corre (el pase de correo). <c>startup_daily</c>: corre al arrancar y
/// luego a la hora. <c>interval</c>: corre al arrancar y luego cada N segundos, medidos desde el
/// arranque del proceso.
/// </param>
/// <param name="HourUtc">Hora objetivo en UTC, cuando el horario es diario.</param>
/// <param name="IntervalSeconds">Periodo de un horario por intervalo.</param>
/// <param name="RunsAtStartup">Si el worker hace una corrida de arranque antes de esperar.</param>
public sealed record JobSchedule(
    string Kind,
    int? HourUtc = null,
    int? IntervalSeconds = null,
    bool RunsAtStartup = false)
{
    public const string Daily = "daily";
    public const string StartupDaily = "startup_daily";
    public const string Interval = "interval";
}

/// <summary>
/// Un job del catálogo: identidad para la UI y los dos datos que solo se pueden leer de la
/// configuración real (si el horario automático está encendido y quién es el dueño).
/// </summary>
public sealed class JobDefinition
{
    public required string Key { get; init; }

    public required string DisplayName { get; init; }

    public required string Description { get; init; }

    /// <summary>Clave de configuración que enciende el horario automático. Se muestra, no se edita.</summary>
    public required string EnabledBy { get; init; }

    public required JobSchedule Schedule { get; init; }

    /// <summary>Estado del interruptor de horario. No afecta a la corrida manual.</summary>
    public required bool AutomaticEnabled { get; init; }

    /// <summary>Dueño configurado (el de la pasada de correo o el de Telegram), o nulo si no aplica o falta.</summary>
    public int? ConfiguredOwnerUserId { get; init; }

    /// <summary>Clave de configuración del dueño; nula cuando el job no tiene dueño configurable.</summary>
    public string? OwnerConfiguredBy { get; init; }

    /// <summary>
    /// Siempre <c>true</c>. Existe para que la pantalla no tenga que deducir de
    /// <see cref="AutomaticEnabled"/> si el botón de ejecutar sirve: apagar el horario no prohíbe la
    /// corrida a demanda (S3).
    /// </summary>
    public bool ManualRunAllowed => true;
}

/// <summary>
/// Catálogo único de jobs (S1/L5). La API acepta una clave solo si está aquí, y la UI lee de aquí el
/// nombre, el horario y el estado del interruptor. Una segunda tabla escrita a mano se separaría de
/// la configuración en el primer despliegue que cambie un valor.
/// </summary>
public interface IJobCatalog
{
    IReadOnlyList<JobDefinition> Jobs { get; }

    bool TryGet(string jobKey, out JobDefinition definition);

    /// <summary>
    /// Próxima corrida automática, o nulo cuando no se puede saber: el job está apagado, o su
    /// horario es por intervalo y el conteo empieza con el proceso.
    /// </summary>
    DateTimeOffset? NextRunAt(string jobKey, DateTimeOffset nowUtc);
}

/// <inheritdoc />
public sealed class JobCatalog : IJobCatalog
{
    private readonly IReadOnlyList<JobDefinition> _jobs;

    public JobCatalog(
        IOptions<AlertsOptions> alertsOptions,
        IOptions<TelegramOptions> telegramOptions,
        IOptions<FxRateSyncOptions> fxRateSyncOptions,
        IOptions<EmailIngestOptions> emailIngestOptions)
    {
        var alerts = alertsOptions.Value;
        var telegram = telegramOptions.Value;
        var fx = fxRateSyncOptions.Value;
        var email = emailIngestOptions.Value;

        _jobs = new[]
        {
            new JobDefinition
            {
                Key = JobKeys.EmailIngest,
                DisplayName = "Ingesta diaria de correo",
                Description = "Etiqueta el correo sin etiquetas de usuario del INBOX con las reglas del "
                    + "usuario configurado. Una corrida manual usa la misma pasada y adelanta el cursor "
                    + "en memoria del proceso.",
                EnabledBy = "Email:Ingest:Enabled",
                Schedule = new JobSchedule(JobSchedule.Daily, HourUtc: ClampHour(email.HourUtc)),
                AutomaticEnabled = email.Enabled,
                ConfiguredOwnerUserId = PositiveOrNull(email.UserId),
                OwnerConfiguredBy = "Email:Ingest:UserId"
            },
            new JobDefinition
            {
                Key = JobKeys.FxRateSync,
                DisplayName = "Sincronización de tipos de cambio",
                Description = "Descarga la tasa de cada divisa activa y escribe solo fechas nuevas. Corre "
                    + "al arrancar, que es lo que recupera los días en que el proceso estuvo caído.",
                EnabledBy = "FxRates:Enabled",
                Schedule = new JobSchedule(
                    JobSchedule.StartupDaily,
                    HourUtc: ClampHour(fx.SyncHourUtc),
                    RunsAtStartup: true),
                AutomaticEnabled = fx.Enabled
            },
            new JobDefinition
            {
                Key = JobKeys.RecurringExecution,
                DisplayName = "Ejecución de gastos programados",
                Description = "Materializa y ejecuta los gastos programados vencidos del usuario "
                    + "configurado. Sin salida de Telegram no ejecuta nada: deja las partidas pendientes.",
                EnabledBy = "Alerts:Enabled",
                Schedule = new JobSchedule(
                    JobSchedule.Interval,
                    IntervalSeconds: IntervalSeconds(alerts.EvaluationIntervalMinutes * 60),
                    RunsAtStartup: true),
                AutomaticEnabled = alerts.Enabled,
                ConfiguredOwnerUserId = PositiveOrNull(telegram.AppUserId),
                OwnerConfiguredBy = "Telegram:AppUserId"
            },
            new JobDefinition
            {
                Key = JobKeys.AlertEvaluation,
                DisplayName = "Evaluación de alertas",
                Description = "Evalúa umbrales de presupuesto y partidas planificadas del usuario "
                    + "configurado. Es idempotente: repetirla no duplica entregas.",
                EnabledBy = "Alerts:Enabled",
                Schedule = new JobSchedule(
                    JobSchedule.Interval,
                    IntervalSeconds: IntervalSeconds(alerts.EvaluationIntervalMinutes * 60),
                    RunsAtStartup: true),
                AutomaticEnabled = alerts.Enabled,
                ConfiguredOwnerUserId = PositiveOrNull(telegram.AppUserId),
                OwnerConfiguredBy = "Telegram:AppUserId"
            },
            new JobDefinition
            {
                Key = JobKeys.AlertDispatch,
                DisplayName = "Envío de alertas",
                Description = "Expira los pendientes de más de siete días y drena el outbox con "
                    + "reintentos y retroceso exponencial.",
                EnabledBy = "Alerts:Enabled",
                Schedule = new JobSchedule(
                    JobSchedule.Interval,
                    IntervalSeconds: IntervalSeconds(alerts.DispatchSeconds),
                    RunsAtStartup: true),
                AutomaticEnabled = alerts.Enabled
            }
        };
    }

    public IReadOnlyList<JobDefinition> Jobs => _jobs;

    public bool TryGet(string jobKey, out JobDefinition definition)
    {
        var found = _jobs.FirstOrDefault(job => string.Equals(job.Key, jobKey, StringComparison.Ordinal));

        definition = found!;
        return found is not null;
    }

    public DateTimeOffset? NextRunAt(string jobKey, DateTimeOffset nowUtc)
    {
        if (!TryGet(jobKey, out var job) || !job.AutomaticEnabled)
        {
            return null;
        }

        if (job.Schedule.Kind is not (JobSchedule.Daily or JobSchedule.StartupDaily)
            || job.Schedule.HourUtc is not int hour)
        {
            return null;
        }

        // La misma función pura que usa el worker. Calcular la hora aquí otra vez duplicaría el borde
        // que convierte un job diario en un ciclo cerrado (a la hora exacta, la espera es un día).
        var delay = job.Key == JobKeys.EmailIngest
            ? EmailIngestSchedule.DelayUntilNextRun(nowUtc, hour)
            : FxSyncSchedule.DelayUntilNextRun(nowUtc, hour);

        return nowUtc + delay;
    }

    private static int ClampHour(int hourUtc) => Math.Clamp(hourUtc, 0, 23);

    private static int IntervalSeconds(int seconds) => Math.Max(1, seconds);

    private static int? PositiveOrNull(int value) => value > 0 ? value : null;
}
