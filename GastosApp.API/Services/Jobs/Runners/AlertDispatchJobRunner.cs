using GastosApp.API.Configuration;
using GastosApp.API.Services.Telegram;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Jobs.Runners;

/// <summary>
/// Adaptador del drenaje del outbox de alertas (S1/L5). Es la corrida que antes vivía dentro de
/// <c>AlertDispatchBackgroundService</c>, movida aquí sin cambiar su comportamiento: el mismo orden
/// (expirar, mirar Telegram, leer lote, enviar), los mismos códigos y el mismo retroceso.
/// <para>
/// El emisor se resuelve del scope <b>después</b> del chequeo de Telegram, igual que antes: con
/// Telegram apagado no se construye ningún cliente de envío. Por eso la dependencia es
/// <see cref="IServiceProvider"/> y no el emisor.
/// </para>
/// <para>
/// Un solo contenedor <c>api</c>: el lote se procesa secuencialmente en este proceso, sin lock
/// distribuido.
/// </para>
/// </summary>
public sealed class AlertDispatchJobRunner : IJobRunner
{
    private readonly IRepository _repository;
    private readonly IServiceProvider _services;
    private readonly AlertsOptions _alertsOptions;
    private readonly TelegramOptions _telegramOptions;
    private readonly ILogger<AlertDispatchJobRunner> _logger;

    public AlertDispatchJobRunner(
        IRepository repository,
        IServiceProvider services,
        IOptions<AlertsOptions> alertsOptions,
        IOptions<TelegramOptions> telegramOptions,
        ILogger<AlertDispatchJobRunner> logger)
    {
        _repository = repository;
        _services = services;
        _alertsOptions = alertsOptions.Value;
        _telegramOptions = telegramOptions.Value;
        _logger = logger;
    }

    public string JobKey => JobKeys.AlertDispatch;

    public async Task<JobRunOutcome> RunAsync(CancellationToken cancellationToken)
    {
        await ExpireStalePendingAsync();

        if (!_telegramOptions.Enabled)
        {
            // Los pendientes se conservan; al habilitar Telegram se drena lo vigente.
            _logger.LogDebug("Alert dispatch skipped: Telegram disabled.");
            return JobRunOutcome.Skipped("telegram_disabled");
        }

        var sender = _services.GetRequiredService<ITelegramAlertSender>();

        var now = DateTimeOffset.UtcNow;
        var batch = await _repository.GetTrack<AlertOutbox>()
            .Where(o => o.Status == AlertOutboxStatus.Pending && o.NextAttemptAt <= now)
            .OrderBy(o => o.OutboxId)
            .Take(_alertsOptions.BatchSize)
            .ToListAsync(cancellationToken);

        if (batch.Count == 0)
        {
            return JobRunOutcome.Succeeded(0, "no_pending");
        }

        var sent = 0;
        var errored = 0;
        var exhausted = 0;

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
                sent++;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                item.Attempts++;
                errored++;

                var decision = AlertDispatchPolicy.Decide(
                    item.Attempts,
                    _alertsOptions.MaxAttempts,
                    exception.GetType().Name,
                    DateTimeOffset.UtcNow);

                item.LastError = decision.LastError;

                if (decision.ShouldFail)
                {
                    item.Status = AlertOutboxStatus.Failed;
                    exhausted++;
                }
                else
                {
                    item.NextAttemptAt = decision.NextAttemptAt!.Value;
                }

                _logger.LogWarning(
                    "Alert delivery {OutboxId} failed (attempt {Attempts}): {ErrorType}",
                    item.OutboxId,
                    item.Attempts,
                    exception.GetType().Name);
            }
        }

        await _repository.SaveChangesAsync();

        if (errored > 0)
        {
            // Una entrega que no salió no es un éxito, aunque el lote haya avanzado.
            return JobRunOutcome.Partial(sent, errored, exhausted > 0 ? "max_attempts" : "retry_scheduled");
        }

        return JobRunOutcome.Succeeded(sent);
    }

    private Task<int> ExpireStalePendingAsync() =>
        _repository.ExecuteSqlRawAsync(AlertDispatchPolicy.ExpireStalePendingSql);
}
