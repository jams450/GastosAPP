using GastosApp.API.Configuration;
using GastosApp.API.Services.Email;
using GastosApp.API.Services.Jobs;
using Microsoft.Extensions.Options;

namespace GastosApp.API.BackgroundServices;

/// <summary>
/// Pase diario de etiquetado del correo (S13/L28), ahora registrado en el historial de jobs (S1/L5).
/// <para>
/// A diferencia del job de tipos de cambio, <b>espera antes de su primera corrida</b>: no hay trabajo
/// de arranque ni reintentos. Con <c>Email:Ingest:Enabled=false</c> —el valor por defecto— o sin un
/// <c>UserId</c> positivo el servicio termina de inmediato con un log legible, sin bloquear el arranque
/// de la API. Ese horario y esas guardas no cambian: el módulo de monitoreo agrega el registro de la
/// corrida, no la decide.
/// </para>
/// <para>
/// La corrida la ejecuta el coordinador, que la abre en el historial antes de trabajar y comparte el
/// candado con la ejecución manual: una corrida a demanda en curso hace que este pase se omita en vez
/// de solaparse.
/// </para>
/// </summary>
public sealed class EmailIngestBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly EmailIngestOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<EmailIngestBackgroundService> _logger;
    private readonly IJobCoordinator? _coordinator;

    /// <param name="coordinator">
    /// Opcional solo por compatibilidad con los llamadores anteriores y sus pruebas; el contenedor de
    /// dependencias siempre lo inyecta. Sin él la corrida se ejecuta igual que antes, sin historial:
    /// ninguna prueba previa a este módulo arma el contenedor completo.
    /// </param>
    public EmailIngestBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<EmailIngestOptions> options,
        TimeProvider timeProvider,
        ILogger<EmailIngestBackgroundService> logger,
        IJobCoordinator? coordinator = null)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _timeProvider = timeProvider;
        _logger = logger;
        _coordinator = coordinator;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            // Inerte por defecto: encenderlo es una decisión del usuario.
            _logger.LogInformation("Email daily ingest disabled (Email:Ingest:Enabled=false).");
            return;
        }

        if (_options.UserId <= 0)
        {
            // Sin dueño explícito no se adivina: no hay usuario 1 implícito ni identidad de Telegram.
            _logger.LogWarning(
                "Email daily ingest has no owner (Email:Ingest:UserId must be positive); it will not run.");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = EmailIngestSchedule.DelayUntilNextRun(_timeProvider.GetUtcNow(), _options.HourUtc);

            try
            {
                // Espera ANTES de la primera corrida: no hay trabajo de arranque ni reintentos.
                await Task.Delay(delay, _timeProvider, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            if (stoppingToken.IsCancellationRequested)
            {
                break;
            }

            await RunOnceAsync(stoppingToken);
        }
    }

    private async Task RunOnceAsync(CancellationToken stoppingToken)
    {
        if (_coordinator is not null)
        {
            await _coordinator.RunAutomaticAsync(JobKeys.EmailIngest, stoppingToken);
            return;
        }

        // Camino sin coordinador (solo llamadores que construyen el servicio a mano). Es la corrida
        // de antes de este módulo, sin fila de historial.
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var runner = scope.ServiceProvider.GetRequiredService<IEmailIngestRunner>();

            var result = await runner.RunAsync(_options.UserId, stoppingToken);

            if (!result.Executed)
            {
                _logger.LogInformation("Email daily ingest skipped: {SkipCode}", result.SkipCode);
                return;
            }

            // Solo conteos: nunca asuntos, remitentes, etiquetas ni credenciales.
            _logger.LogInformation(
                "Email daily ingest finished: {Scanned} scanned, {Planned} planned, {Applied} applied, {Skipped} skipped, {Failed} failed.",
                result.Scanned,
                result.Planned,
                result.Applied,
                result.Skipped,
                result.Failed);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado ordenado: no es un error.
        }
        catch (Exception exception)
        {
            // Solo el tipo de excepción.
            _logger.LogError("Email daily ingest failed: {ErrorType}", exception.GetType().Name);
        }
    }
}
