namespace GastosApp.AI.Intent;

public sealed record IntentResult(
    IntentKind Kind,
    decimal? Monto,
    string? Cuenta,
    string? Categoria,
    DateOnly? Fecha,
    string? Descripcion,
    string? PreguntaAclaratoria);
