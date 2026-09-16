namespace GastosApp.AI.Intent;

public sealed record IntentResult(
    IntentKind Kind,
    decimal? Monto,
    string? Cuenta,
    string? Categoria,
    string? Subcategoria,
    string? Comercio,
    DateOnly? Fecha,
    TimeOnly? Hora,
    string? Descripcion,
    string? PreguntaAclaratoria);
