namespace GastosApp.API.Models.Fx;

/// <summary>
/// Conteos de una sincronización forzada. Solo números: ni tasas ni la configuración del proveedor.
/// </summary>
public class FxRateSyncResponse
{
    public int Synced { get; set; }
    public int Skipped { get; set; }
    public int Failed { get; set; }
    public int Total { get; set; }
}
