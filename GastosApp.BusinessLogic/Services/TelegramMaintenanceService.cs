using GastosApp.BusinessLogic.Interfaces;

namespace GastosApp.BusinessLogic.Services;

/// <summary>
/// Coordina el mantenimiento de borradores y del ledger de updates en una sola llamada.
/// Sin estado ni scheduling: el llamador decide cuándo ejecutarlo (endpoint, cron, job externo).
/// </summary>
public class TelegramMaintenanceService : ITelegramMaintenanceService
{
    /// <summary>Retención de borradores ya resueltos antes de purgarlos.</summary>
    public static readonly TimeSpan DefaultDraftRetention = TimeSpan.FromDays(1);

    /// <summary>Retención de updates terminados (o leases abandonados) antes de purgarlos.</summary>
    public static readonly TimeSpan DefaultUpdateRetention = TimeSpan.FromDays(1);

    private readonly IExpenseDraftService _drafts;
    private readonly ITelegramUpdateLedger _ledger;

    public TelegramMaintenanceService(IExpenseDraftService drafts, ITelegramUpdateLedger ledger)
    {
        _drafts = drafts;
        _ledger = ledger;
    }

    public async Task<TelegramMaintenanceResult> RunAsync(DateTime utcNow, CancellationToken cancellationToken = default)
    {
        var now = utcNow == default ? DateTime.UtcNow : utcNow;

        // Primero expira (marca) y luego purga con el corte ya desplazado: un borrador recién
        // expirado no se purga hasta que supere la retención.
        var expired = await _drafts.ExpireStaleAsync(now, cancellationToken);
        var draftsPurged = await _drafts.PurgeAsync(now - DefaultDraftRetention, cancellationToken);
        var updatesPurged = await _ledger.PurgeAsync(now - DefaultUpdateRetention, cancellationToken);

        return new TelegramMaintenanceResult(expired, draftsPurged, updatesPurged);
    }
}
