using GastosApp.BusinessLogic.Models.Fx;

namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// Lectura de tipos de cambio. Todo se resuelve con la regla de carry-forward: la tasa vigente en una
/// fecha es la última publicada <b>en o antes</b> de esa fecha.
/// </summary>
public interface IFxRateQueryService
{
    /// <summary>
    /// Última tasa conocida de cada divisa activa distinta de la base. Una divisa sin ninguna tasa
    /// publicada simplemente no aparece: no se inventa un valor.
    /// </summary>
    Task<IReadOnlyList<FxRateQuote>> GetLatestPerCurrencyAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Tasa vigente para <paramref name="currencyCode"/> en <paramref name="date"/>, o <c>null</c> si no
    /// hay ninguna publicada en o antes de esa fecha.
    /// </summary>
    Task<FxRateQuote?> ResolveAsync(string currencyCode, DateOnly date, CancellationToken cancellationToken);
}
