namespace GastosApp.BusinessLogic.Models.Fx;

/// <summary>
/// Resultado de una corrida de sincronización. Solo conteos: es lo único que puede ir a un log sin
/// exponer tasas ni configuración.
/// </summary>
/// <param name="Synced">Divisas con una tasa nueva escrita.</param>
/// <param name="Skipped">Divisas cuya tasa ya estaba cubierta (idempotencia por fecha).</param>
/// <param name="Failed">Divisas cuyo proveedor falló. No se escribió nada por ellas.</param>
public sealed record FxRateSyncResult(int Synced, int Skipped, int Failed)
{
    public int Total => Synced + Skipped + Failed;
}
