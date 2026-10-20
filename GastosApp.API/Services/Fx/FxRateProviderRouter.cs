using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Fx;

namespace GastosApp.API.Services.Fx;

/// <summary>
/// Elige el proveedor por divisa, según la decisión tomada con la evidencia del repo de referencia.
/// <para>
/// USD va a Banxico (FIX oficial). Las demás divisas van a Frankfurter, porque la serie FIX solo sirve
/// USD/MXN. Si Banxico falla para USD, se reintenta con Frankfurter: es preferible una tasa de origen
/// Banxico obtenida por otra vía que dejar el día sin tasa.
/// </para>
/// <para>
/// El respaldo es <b>solo</b> para USD. Para el resto no se intenta Banxico, porque su serie rechazaría
/// el par y el intento solo agregaría un error garantizado al log.
/// </para>
/// </summary>
public sealed class FxRateProviderRouter
{
    private readonly BanxicoFxRateProvider _banxico;
    private readonly FrankfurterFxRateProvider _frankfurter;

    public FxRateProviderRouter(BanxicoFxRateProvider banxico, FrankfurterFxRateProvider frankfurter)
    {
        _banxico = banxico;
        _frankfurter = frankfurter;
    }

    public async Task<FxRateFetchResult> GetLatestAsync(string currencyCode, CancellationToken cancellationToken)
    {
        var code = (currencyCode ?? string.Empty).Trim().ToUpperInvariant();

        if (!string.Equals(code, BanxicoFxRateProvider.SupportedCurrency, StringComparison.Ordinal))
        {
            return await _frankfurter.GetLatestAsync(code, cancellationToken);
        }

        try
        {
            return await _banxico.GetLatestAsync(code, cancellationToken);
        }
        catch (HttpRequestException)
        {
            // Token ausente, serie caída o respuesta inválida: se intenta la vía alterna.
            return await _frankfurter.GetLatestAsync(code, cancellationToken);
        }
    }
}
