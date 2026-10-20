using System.Globalization;
using System.Text.Json;
using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Fx;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Fx;

/// <summary>
/// Tipo de cambio para las divisas que la serie FIX de Banxico no cubre (EUR, GBP, CAD, JPY), sin token.
/// <para>
/// La ruta <c>v2/providers/banxico/rate/{base}/{quote}</c> devuelve tasas cuyo origen es Banxico, así
/// que la fuente sigue siendo el Banco de México y no se inventa una serie por divisa. Frankfurter
/// suele ir un día atrás, y eso no es un problema: la tasa se guarda con la fecha que reporta y el
/// carry-forward de <c>FxRateSelection</c> resuelve el hueco.
/// </para>
/// </summary>
public sealed class FrankfurterFxRateProvider : IFxRateProvider
{
    private const string RatePath = "v2/providers/banxico/rate";
    private const string QuoteCurrency = "mxn";

    private readonly HttpClient _httpClient;
    private readonly FrankfurterOptions _options;

    public FrankfurterFxRateProvider(HttpClient httpClient, IOptions<FrankfurterOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public string Source => "banxico";

    public async Task<FxRateFetchResult> GetLatestAsync(string currencyCode, CancellationToken cancellationToken)
    {
        var baseCode = (currencyCode ?? string.Empty).Trim().ToLowerInvariant();
        if (baseCode.Length != 3)
        {
            throw new HttpRequestException("El código de divisa debe tener tres letras.");
        }

        var path = $"{RatePath}/{Uri.EscapeDataString(baseCode)}/{QuoteCurrency}";
        var uri = new Uri(new Uri(_options.BaseUrl), path);

        using var response = await _httpClient.GetAsync(uri, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException("El tipo de cambio de Frankfurter no está disponible.", null, response.StatusCode);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        try
        {
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var root = document.RootElement;

            var dateText = root.TryGetProperty("date", out var dateElement) && dateElement.ValueKind == JsonValueKind.String
                ? dateElement.GetString()
                : null;
            var responseBase = root.TryGetProperty("base", out var baseElement) && baseElement.ValueKind == JsonValueKind.String
                ? baseElement.GetString()
                : null;
            var responseQuote = root.TryGetProperty("quote", out var quoteElement) && quoteElement.ValueKind == JsonValueKind.String
                ? quoteElement.GetString()
                : null;

            // Se rechaza un payload de otro par en vez de guardarlo bajo la clave pedida: un error de
            // validación es preferible a una tasa correcta asignada a la divisa equivocada.
            if (!DateOnly.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var rateDate) ||
                !string.Equals(responseBase, baseCode, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(responseQuote, QuoteCurrency, StringComparison.OrdinalIgnoreCase) ||
                !root.TryGetProperty("rate", out var rateElement) ||
                !rateElement.TryGetDecimal(out var rate) ||
                rate <= 0m)
            {
                throw new HttpRequestException("La respuesta FX de Frankfurter está mal formada.");
            }

            return new FxRateFetchResult(baseCode.ToUpperInvariant(), rate, rateDate, Source);
        }
        catch (JsonException ex)
        {
            throw new HttpRequestException("La respuesta FX de Frankfurter está mal formada.", ex);
        }
    }
}
