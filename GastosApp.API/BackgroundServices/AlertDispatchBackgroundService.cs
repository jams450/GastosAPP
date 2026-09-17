using GastosApp.API.Configuration;
using GastosApp.API.Services.Telegram;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace GastosApp.API.BackgroundServices;

/// <summary>
/// Drena el outbox transaccional de alertas cada <c>Alerts:DispatchSeconds</c>.
/// Un solo contenedor <c>api</c>: el lote se procesa secuencialmente en este proceso, sin
/// lock distribuido.
/// <para>
/// ponytail: ceiling conocido single-container. Con varias réplicas cambiar el SELECT a
/// <c>FOR UPDATE SKIP LOCKED</c>.
/// </para>
/// </summary>
public sealed class AlertDispatchBackgroundService : BackgroundService
{
    private const string ExpiredError = "expired";
    private const string MaxAttemptsError = "max_attempts";
    private static readonly TimeSpan MaxBackoff = TimeSpan.FromMinutes(30);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly AlertsOptions _alertsOptions;
    private readonly TelegramOptions _telegramOptions;
    private readonly ILogger<AlertDispatchBackgroundService> _logger;

    public AlertDispatchBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<AlertsOptions> alertsOptions,
        IOptions<TelegramOptions> telegramOptions,
        ILogger<AlertDispatchBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _alertsOptions = alertsOptions.Value;
        _telegramOptions = telegramOptions.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_alertsOptions.Enabled)
        {
            _logger.LogInformation("Alert dispatch disabled (Alerts:Enabled=false).");
            return;
        }

        var interval = TimeSpan.FromSeconds(_alertsOptions.DispatchSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await DispatchOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                // Solo el tipo: nunca payload ni mensaje de excepción.
                _logger.LogError("Alert dispatch failed: {ErrorType}", exception.GetType().Name);
            }

            try
            {
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task DispatchOnceAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IRepository>();

        await ExpireStalePendingAsync(repository);

        if (!_telegramOptions.Enabled)
        {
            // Los pendientes se conservan; al habilitar Telegram se drena lo vigente.
            _logger.LogDebug("Alert dispatch skipped: Telegram disabled.");
            return;
        }

        var sender = scope.ServiceProvider.GetRequiredService<ITelegramAlertSender>();

        var now = DateTimeOffset.UtcNow;
        var batch = await repository.GetTrack<AlertOutbox>()
            .Where(o => o.Status == AlertOutboxStatus.Pending && o.NextAttemptAt <= now)
            .OrderBy(o => o.OutboxId)
            .Take(_alertsOptions.BatchSize)
            .ToListAsync(cancellationToken);

        if (batch.Count == 0) return;

        foreach (var item in batch)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                await sender.SendAsync(item.Payload, cancellationToken);
                item.Status = AlertOutboxStatus.Sent;
                item.SentAt = DateTimeOffset.UtcNow;
                item.Attempts++;
                item.LastError = null;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                item.Attempts++;

                if (item.Attempts >= _alertsOptions.MaxAttempts)
                {
                    item.Status = AlertOutboxStatus.Failed;
                    item.LastError = MaxAttemptsError;
                }
                else
                {
                    item.LastError = Truncate(exception.GetType().Name);
                    item.NextAttemptAt = DateTimeOffset.UtcNow + Backoff(item.Attempts);
                }

                _logger.LogWarning(
                    "Alert delivery {OutboxId} failed (attempt {Attempts}): {ErrorType}",
                    item.OutboxId,
                    item.Attempts,
                    exception.GetType().Name);
            }
        }

        await repository.SaveChangesAsync();
    }

    /// <summary>Pendientes con más de 7 días se marcan <c>failed</c>: ya no son accionables.</summary>
    private static Task<int> ExpireStalePendingAsync(IRepository repository) =>
        repository.ExecuteSqlRawAsync("""
            UPDATE alert_outbox
            SET status = 'failed', last_error = 'expired', updated_at = NOW()
            WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days'
            """);

    private static TimeSpan Backoff(int attempts)
    {
        var seconds = Math.Min(Math.Pow(2, Math.Clamp(attempts, 1, 10)) * 30, MaxBackoff.TotalSeconds);
        return TimeSpan.FromSeconds(seconds);
    }

    private static string Truncate(string value) =>
        value.Length <= 500 ? value : value[..500];
}
