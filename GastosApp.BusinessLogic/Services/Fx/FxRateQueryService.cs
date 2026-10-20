using GastosApp.BusinessLogic.Context;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Fx;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services.Fx;

public sealed class FxRateQueryService : IFxRateQueryService
{
    private readonly ContextSqlGastos _context;

    public FxRateQueryService(ContextSqlGastos context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<FxRateQuote>> GetLatestPerCurrencyAsync(CancellationToken cancellationToken)
    {
        var currencyCodes = await _context.Currencies
            .AsNoTracking()
            .Where(currency => currency.Active && !currency.IsBase)
            .Select(currency => currency.Code)
            .ToListAsync(cancellationToken);

        if (currencyCodes.Count == 0)
        {
            return Array.Empty<FxRateQuote>();
        }

        // La base nunca necesita tasa, y una fecha futura nunca es "la última": si se filtrara de menos,
        // una tasa cargada por error con fecha adelantada se mostraría como vigente.
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var latestDates = await _context.FxRates
            .AsNoTracking()
            .Where(rate => currencyCodes.Contains(rate.CurrencyCode) && rate.RateDate <= today)
            .GroupBy(rate => rate.CurrencyCode)
            .Select(group => new { CurrencyCode = group.Key, RateDate = group.Max(rate => rate.RateDate) })
            .ToListAsync(cancellationToken);

        if (latestDates.Count == 0)
        {
            return Array.Empty<FxRateQuote>();
        }

        // Se piden solo las fechas candidatas, no todo el historial: la tabla crece un renglón por divisa
        // al día y no hay razón para traerla completa.
        var candidateDates = latestDates.Select(entry => entry.RateDate).Distinct().ToList();

        var rows = await _context.FxRates
            .AsNoTracking()
            .Where(rate => currencyCodes.Contains(rate.CurrencyCode) && candidateDates.Contains(rate.RateDate))
            .Select(rate => new { rate.CurrencyCode, rate.RateDate, rate.RateMxn, rate.Source })
            .ToListAsync(cancellationToken);

        var wanted = latestDates.ToDictionary(entry => entry.CurrencyCode, entry => entry.RateDate);

        return rows
            .Where(row => wanted.TryGetValue(row.CurrencyCode, out var date) && date == row.RateDate)
            .Select(row => new FxRateQuote(row.CurrencyCode, row.RateDate, row.RateMxn, row.Source))
            .OrderBy(quote => quote.CurrencyCode, StringComparer.Ordinal)
            .ToList();
    }

    public async Task<FxRateQuote?> ResolveAsync(string currencyCode, DateOnly date, CancellationToken cancellationToken)
    {
        var code = (currencyCode ?? string.Empty).Trim().ToUpperInvariant();
        if (code.Length != 3)
        {
            return null;
        }

        // El carry-forward es esta consulta: la más reciente en o antes de la fecha pedida.
        var row = await _context.FxRates
            .AsNoTracking()
            .Where(rate => rate.CurrencyCode == code && rate.RateDate <= date)
            .OrderByDescending(rate => rate.RateDate)
            .Select(rate => new { rate.RateDate, rate.RateMxn, rate.Source })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? null
            : new FxRateQuote(code, row.RateDate, row.RateMxn, row.Source);
    }
}
