namespace GastosApp.BusinessLogic.Models.Fx;

/// <summary>
/// Una tasa recién obtenida de un proveedor, antes de persistirse.
/// <para>
/// <see cref="RateDate"/> es la fecha que el proveedor reporta para la tasa, no la fecha en que se
/// consultó: Banxico publica solo en días hábiles, así que un sábado devuelve la tasa del viernes y
/// ese viernes es el dato que debe quedar guardado.
/// </para>
/// </summary>
public sealed record FxRateFetchResult(string CurrencyCode, decimal RateMxn, DateOnly RateDate, string Source);
