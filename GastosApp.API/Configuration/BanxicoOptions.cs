namespace GastosApp.API.Configuration;

/// <summary>
/// Configuración del proveedor Banxico SIE. <see cref="Token"/> es un secreto: nunca se registra en
/// logs ni viaja en la URL.
/// </summary>
public sealed class BanxicoOptions
{
    public const string SectionName = "Banxico";

    public bool Enabled { get; set; }

    public string Token { get; set; } = string.Empty;

    /// <summary>
    /// Raíz del servicio SIE. No es secreto. Se deja configurable para poder apuntar a un doble de
    /// prueba sin recompilar.
    /// </summary>
    public string BaseUrl { get; set; } = "https://www.banxico.org.mx/";
}
