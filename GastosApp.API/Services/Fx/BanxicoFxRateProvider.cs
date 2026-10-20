using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Fx;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Fx;

/// <summary>
/// Tipo de cambio FIX de Banxico para USD/MXN (serie <c>SF43718</c>).
/// <para>
/// La serie sirve <b>solo</b> USD/MXN. Cualquier otra divisa se rechaza aquí, no se aproxima: Banxico
/// publica una serie por divisa y el FIX de USD es la única oficial; los cruces con EUR, GBP, CAD y JPY
/// son informativos según el propio Banco de México.
/// </para>
/// <para>
/// El token viaja en el header <c>Bmx-Token</c> y nunca en la URL, para que no pueda aparecer en un log
/// de acceso. Los errores se reportan solo por código de estado.
/// </para>
/// </summary>
public sealed class BanxicoFxRateProvider : IFxRateProvider
{
    /// <summary>Serie FIX: pesos por dólar de EE.UU.</summary>
    public const string UsdSeries = "SF43718";

    public const string SupportedCurrency = "USD";

    private const string SeriesPath = "SieAPIRest/service/v1/series/" + UsdSeries + "/datos/oportuno";
    private const string TokenHeader = "Bmx-Token";

    private readonly HttpClient _httpClient;
    private readonly BanxicoOptions _options;

    public BanxicoFxRateProvider(HttpClient httpClient, IOptions<BanxicoOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public string Source => "banxico";

    public async Task<FxRateFetchResult> GetLatestAsync(string currencyCode, CancellationToken cancellationToken)
    {
        if (!string.Equals(currencyCode, SupportedCurrency, StringComparison.OrdinalIgnoreCase))
        {
            throw new HttpRequestException($"La serie {UsdSeries} de Banxico solo sirve USD/MXN.");
        }

        if (string.IsNullOrWhiteSpace(_options.Token) ||
            _options.Token.StartsWith("SET_", StringComparison.OrdinalIgnoreCase))
        {
            throw new HttpRequestException("Banxico:Token no está configurado.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(new Uri(_options.BaseUrl), SeriesPath));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.TryAddWithoutValidation(TokenHeader, _options.Token);

        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            // Solo el estado: el token nunca debe alcanzar una línea de log.
            throw new HttpRequestException("La serie FX de Banxico no está disponible.", null, response.StatusCode);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        try
        {
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var root = document.RootElement;

            if (!root.TryGetProperty("bmx", out var bmx) ||
                !bmx.TryGetProperty("series", out var series) ||
                series.ValueKind != JsonValueKind.Array ||
                series.GetArrayLength() == 0 ||
                !series[0].TryGetProperty("datos", out var datos) ||
                datos.ValueKind != JsonValueKind.Array ||
                datos.GetArrayLength() == 0)
            {
                throw new HttpRequestException("La respuesta FX de Banxico está mal formada.");
            }

            var latest = datos[0];
            var dateText = latest.TryGetProperty("fecha", out var fecha) && fecha.ValueKind == JsonValueKind.String
                ? fecha.GetString()
                : null;
            var rateText = latest.TryGetProperty("dato", out var dato) && dato.ValueKind == JsonValueKind.String
                ? dato.GetString()
                : null;

            // Banxico manda la tasa como texto y la fecha como dd/MM/yyyy; "N/E" en días no hábiles,
            // que al no parsear convierte la respuesta en "no disponible" en vez de en un cero.
            if (!DateOnly.TryParseExact(dateText, "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var rateDate) ||
                !decimal.TryParse(rateText, NumberStyles.Number, CultureInfo.InvariantCulture, out var rate) ||
                rate <= 0m)
            {
                throw new HttpRequestException("La respuesta FX de Banxico está mal formada.");
            }

            return new FxRateFetchResult(SupportedCurrency, rate, rateDate, Source);
        }
        catch (JsonException ex)
        {
            throw new HttpRequestException("La respuesta FX de Banxico está mal formada.", ex);
        }
    }
}
