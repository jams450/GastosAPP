using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.Extensions.Logging;
using Telegram.Bot.Types;

namespace GastosApp.API.Services.Telegram;

public sealed class TelegramUpdateService : ITelegramUpdateService
{
    private const string RateLimitedMessage = "Demasiados mensajes seguidos. Espera un momento e intenta de nuevo.";

    // Mantenimiento ligero: a lo sumo una corrida cada 6 h, aunque lleguen muchos updates.
    private static readonly TimeSpan MaintenanceInterval = TimeSpan.FromHours(6);
    private static long _lastMaintenanceTicks;

    private readonly TelegramMessageRouter _router;
    private readonly TelegramBotClientProvider _bot;
    private readonly TelegramRateLimiter _rateLimiter;
    private readonly ITelegramUpdateLedger _ledger;
    private readonly ITelegramMaintenanceService _maintenance;
    private readonly ILogger<TelegramUpdateService> _logger;

    public TelegramUpdateService(
        TelegramMessageRouter router,
        TelegramBotClientProvider bot,
        TelegramRateLimiter rateLimiter,
        ITelegramUpdateLedger ledger,
        ITelegramMaintenanceService maintenance,
        ILogger<TelegramUpdateService> logger)
    {
        _router = router;
        _bot = bot;
        _rateLimiter = rateLimiter;
        _ledger = ledger;
        _maintenance = maintenance;
        _logger = logger;
    }

    public async Task HandleAsync(Update update, TelegramIdentity identity, CancellationToken cancellationToken)
    {
        // Idempotencia durable: el reclamo ocurre antes de cualquier efecto.
        // El token del lease (fencing token) se guarda y se reenvía a MarkDone/MarkFailed: si el
        // lease expiró y otro worker reclamó, esas llamadas no afectan la fila ajena.
        var claim = await _ledger.ClaimAsync(update.Id, identity.TelegramIdentityId, cancellationToken);
        if (claim.Outcome != TelegramUpdateClaimOutcome.Claimed || claim.ClaimToken is not { } claimToken)
        {
            _logger.LogInformation("Telegram update {UpdateId} skipped: {Outcome}.", update.Id, claim.Outcome);
            await TryRunMaintenanceAsync(cancellationToken);
            return;
        }

        try
        {
            await ProcessAsync(update, identity, cancellationToken);

            // MarkDone solo cuando el procesamiento local terminó (efecto DB y respuesta intentada).
            await _ledger.MarkDoneAsync(update.Id, claimToken, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // El lease expira y el update queda reclaimable.
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogError("Telegram update {UpdateId} failed: {ErrorType}.", update.Id, exception.GetType().Name);
            await TryMarkFailedAsync(update.Id, claimToken, cancellationToken);
        }

        await TryRunMaintenanceAsync(cancellationToken);
    }

    private async Task ProcessAsync(Update update, TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var message = update.Message;
        var text = message?.Text;
        if (message is null || string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var chatId = message.Chat.Id;

        if (!_rateLimiter.TryAcquire(identity.TelegramIdentityId))
        {
            await _bot.TrySendAsync(chatId, RateLimitedMessage, update.Id, cancellationToken);
            return;
        }

        // El router decide: comandos/atajos deterministas o texto libre (extracción + intención).
        var reply = await _router.RouteAsync(text, identity, cancellationToken);

        if (!string.IsNullOrWhiteSpace(reply))
        {
            await _bot.TrySendAsync(chatId, reply, update.Id, cancellationToken);
        }
    }

    private async Task TryMarkFailedAsync(long updateId, Guid claimToken, CancellationToken cancellationToken)
    {
        try
        {
            if (!await _ledger.MarkFailedAsync(updateId, claimToken, cancellationToken))
            {
                _logger.LogInformation("Telegram update {UpdateId} lease was reclaimed; not marking failed.", updateId);
            }
        }
        catch (Exception exception)
        {
            _logger.LogWarning("Telegram update {UpdateId} could not be marked failed: {ErrorType}.", updateId, exception.GetType().Name);
        }
    }

    /// <summary>
    /// Mantenimiento best-effort (expira/purga borradores y purga updates terminados). Rate-limit estático:
    /// se ejecuta como máximo cada <see cref="MaintenanceInterval"/>, aunque cada request la invoque.
    /// </summary>
    private async Task TryRunMaintenanceAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var last = Interlocked.Read(ref _lastMaintenanceTicks);
        if (now.Ticks - last < MaintenanceInterval.Ticks)
        {
            return;
        }

        // Gana un solo hilo; el resto sale sin ejecutar (suficiente para mantenimiento ligero).
        if (Interlocked.CompareExchange(ref _lastMaintenanceTicks, now.Ticks, last) != last)
        {
            return;
        }

        try
        {
            await _maintenance.RunAsync(now, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Best-effort: se reintenta en el siguiente ciclo.
        }
        catch (Exception exception)
        {
            _logger.LogWarning("Telegram maintenance failed: {ErrorType}.", exception.GetType().Name);
        }
    }
}
