using GastosApp.API.Configuration;
using GastosApp.API.Services.Email;
using Microsoft.Extensions.Options;

namespace GastosApp.API.BackgroundServices;

/// <summary>
/// Pase diario de etiquetado del correo (S13/L28).
/// <para>
/// A diferencia del job de tipos de cambio, <b>espera antes de su primera corrida</b>: no hay trabajo
/// de arranque ni reintentos. Con <c>Email:Ingest:Enabled=false</c> —el valor por defecto— o sin un
/// <c>UserId</c> positivo el servicio termina de inmediato con un log legible, sin bloquear el arranque
/// de la API.
/// </para>
/// <para>
/// Crea un scope por corrida, como los demás jobs. Su bucle es secuencial, así que dos corridas del
/// mismo proceso no se solapan; aplicar etiquetas es idempotente de todos modos.
/// </para>
/// </summary>
public sealed class EmailIngestBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly EmailIngestOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<EmailIngestBackgroundService> _logger;

    public EmailIngestBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<EmailIngestOptions> options,
        TimeProvider timeProvider,
        ILogger<EmailIngestBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _timeProvider = timeProvider;
        _logger = logger;
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
