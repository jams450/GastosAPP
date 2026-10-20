using GastosApp.BusinessLogic.Models.Fx;

namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// Descarga y guarda la tasa de cada divisa activa del catálogo. Es idempotente: repetir la corrida el
/// mismo día no duplica filas.
/// </summary>
public interface IFxRateSyncService
{
    Task<FxRateSyncResult> SyncAsync(CancellationToken cancellationToken);
}
