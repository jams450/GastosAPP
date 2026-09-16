namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// Mantenimiento coordinado del estado de Telegram (borradores + ledger de updates).
/// Es un método invocable bajo demanda: no crea hosted service ni timer propio.
/// </summary>
public interface ITelegramMaintenanceService
{
    /// <summary>
    /// Expira borradores pendientes vencidos y purga borradores resueltos y updates terminados
    /// según la retención por defecto. Idempotente y seguro de ejecutar en paralelo.
    /// </summary>
    Task<TelegramMaintenanceResult> RunAsync(DateTime utcNow, CancellationToken cancellationToken = default);
}

public sealed record TelegramMaintenanceResult(int DraftsExpired, int DraftsPurged, int UpdatesPurged);
