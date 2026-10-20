namespace GastosApp.API.Configuration;

/// <summary>
/// Configuración del proveedor Frankfurter. No usa token: su ruta
/// <c>v2/providers/banxico/rate/{base}/{quote}</c> ya devuelve tasas originadas en Banxico para los
/// pares que la serie FIX (USD/MXN) no cubre.
/// </summary>
public sealed class FrankfurterOptions
{
    public const string SectionName = "Frankfurter";

    public string BaseUrl { get; set; } = "https://api.frankfurter.dev/";
}
