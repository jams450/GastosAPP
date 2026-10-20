namespace GastosApp.BusinessLogic.Models.Fx;

/// <summary>Una tasa publicada: pesos por una unidad de la divisa, en una fecha concreta.</summary>
public sealed record FxRatePoint(DateOnly RateDate, decimal RateMxn);
