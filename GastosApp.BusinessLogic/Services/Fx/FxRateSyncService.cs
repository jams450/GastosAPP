using GastosApp.BusinessLogic.Context;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Fx;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GastosApp.BusinessLogic.Services.Fx;

/// <summary>
/// Sincroniza las tasas de las divisas activas contra el proveedor configurado.
/// <para>
/// Tres criterios que no son obvios: la divisa base se salta (consolidar a MXN no requiere tasa), un
/// fallo de una divisa no cancela a las demás, y un fallo <b>nunca</b> escribe una tasa: el hueco lo
/// cubre el carry-forward al leer, que es preferible a un número inventado.
/// </para>
/// </summary>
public sealed class FxRateSyncService : IFxRateSyncService
{
    private readonly ContextSqlGastos _context;
    private readonly IFxRateProvider _provider;
    private readonly ILogger<FxRateSyncService> _logger;

    public FxRateSyncService(
        ContextSqlGastos context,
        IFxRateProvider provider,
        ILogger<FxRateSyncService> logger)
    {
        _context = context;
        _provider = provider;
        _logger = logger;
    }

    public async Task<FxRateSyncResult> SyncAsync(CancellationToken cancellationToken)
    {
        // La divisa base queda fuera por definición: su tasa contra sí misma es 1 y no se publica.
        var currencyCodes = await _context.Currencies
            .AsNoTracking()
            .Where(currency => currency.Active && !currency.IsBase)
            .OrderBy(currency => currency.Code)
            .Select(currency => currency.Code)
            .ToListAsync(cancellationToken);

        var synced = 0;
        var skipped = 0;
        var failed = 0;

        foreach (var currencyCode in currencyCodes)
        {
            try
            {
                if (await SyncOneAsync(currencyCode, cancellationToken))
                {
                    synced++;
                }
                else
                {
                    skipped++;
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                // Una divisa caída no debe impedir sincronizar las demás. Solo el tipo de excepción:
                // nunca la respuesta del proveedor ni la tasa.
                failed++;
                _logger.LogWarning(
                    "FX rate sync failed for {CurrencyCode}: {ErrorType}",
                    currencyCode,
                    exception.GetType().Name);
            }
        }

        return new FxRateSyncResult(synced, skipped, failed);
    }

    /// <summary>Devuelve <c>true</c> si escribió una tasa nueva, <c>false</c> si ya estaba cubierta.</summary>
    private async Task<bool> SyncOneAsync(string currencyCode, CancellationToken cancellationToken)
    {
        var fetched = await _provider.GetLatestAsync(currencyCode, cancellationToken);

        var latestStoredDate = await _context.FxRates
            .AsNoTracking()
            .Where(rate => rate.CurrencyCode == currencyCode)
            .OrderByDescending(rate => rate.RateDate)
            .Select(rate => (DateOnly?)rate.RateDate)
            .FirstOrDefaultAsync(cancellationToken);

        if (!FxRateWritePolicy.ShouldWrite(fetched, latestStoredDate))
        {
            return false;
        }

        _context.FxRates.Add(new FxRate
        {
            CurrencyCode = currencyCode,
            // La fecha del proveedor, no la de la corrida: Banxico reporta el viernes cuando se consulta
            // el sábado, y ese viernes es el dato correcto.
            RateDate = fetched.RateDate,
            RateMxn = fetched.RateMxn,
            Source = fetched.Source,
            FetchedAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
