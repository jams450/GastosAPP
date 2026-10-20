using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// Lectura del catálogo de monedas. Es global, no por usuario: una divisa es un dato del sistema, no una
/// preferencia personal.
/// </summary>
public interface ICurrencyService
{
    /// <summary>Monedas activas, con la base primero para que la interfaz la ofrezca como predeterminada.</summary>
    Task<IReadOnlyList<Currency>> GetActiveAsync(CancellationToken cancellationToken);
}
