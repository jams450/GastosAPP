using GastosApp.BusinessLogic.Context;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services.Fx;

public sealed class CurrencyService : ICurrencyService
{
    private readonly ContextSqlGastos _context;

    public CurrencyService(ContextSqlGastos context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<Currency>> GetActiveAsync(CancellationToken cancellationToken)
    {
        // La base primero: es la predeterminada de captura y el destino de la consolidación.
        return await _context.Currencies
            .AsNoTracking()
            .Where(currency => currency.Active)
            .OrderByDescending(currency => currency.IsBase)
            .ThenBy(currency => currency.Code)
            .ToListAsync(cancellationToken);
    }
}
