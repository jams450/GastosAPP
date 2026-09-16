namespace GastosApp.AI.Intent;

public sealed record IntentRequest(
    string Texto,
    DateTimeOffset Ahora,
    string ZonaHoraria,
    IReadOnlyList<string> Cuentas,
    IReadOnlyList<string> Categorias);
