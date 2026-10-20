using GastosApp.BusinessLogic.Models.Fx;

namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// Proveedor de tipos de cambio. Cada implementación cubre las divisas que su fuente publica y
/// <b>falla</b> con una divisa que no sirve, en lugar de devolver algo aproximado.
/// </summary>
public interface IFxRateProvider
{
    /// <summary>Nombre corto de la fuente; se persiste en <c>fx_rates.source</c>.</summary>
    string Source { get; }

    /// <summary>
    /// Tasa más reciente publicada para <paramref name="currencyCode"/>, expresada en pesos por
    /// <b>una</b> unidad de esa divisa.
    /// </summary>
    /// <exception cref="HttpRequestException">
    /// La fuente no está disponible, no soporta la divisa o la respuesta es inválida.
    /// </exception>
    Task<FxRateFetchResult> GetLatestAsync(string currencyCode, CancellationToken cancellationToken);
}
