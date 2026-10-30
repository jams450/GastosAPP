namespace GastosApp.API.Services.Jobs;

/// <summary>Decisión de reintento para una entrega de alerta que falló.</summary>
/// <param name="ShouldFail">Si la fila se cierra como <c>failed</c> en vez de reprogramarse.</param>
/// <param name="LastError">Código estable (<c>max_attempts</c>) o el tipo de la excepción.</param>
/// <param name="NextAttemptAt">Nueva cita de reintento; nula cuando la fila se cierra.</param>
public readonly record struct AlertDispatchFailure(
    bool ShouldFail,
    string LastError,
    DateTimeOffset? NextAttemptAt);

/// <summary>
/// Reglas del drenaje del outbox de alertas, extraídas del worker para que el módulo de monitoreo
/// pueda reutilizar la corrida sin mover sus números (L5).
/// <para>
/// Los tres valores que un operador lee en el outbox —el retroceso exponencial acotado, el código
/// <c>max_attempts</c> y la expiración de pendientes a los siete días con <c>expired</c>— quedan
/// aquí como funciones puras. El bucle que habla con EF sigue en el adaptador y es el mismo de
/// antes; lo que cambió es dónde vive la decisión.
/// </para>
/// </summary>
public static class AlertDispatchPolicy
{
    public const string ExpiredError = "expired";
    public const string MaxAttemptsError = "max_attempts";

    /// <summary>Tope del retroceso: una alerta no se reintenta más de cada media hora.</summary>
    public static readonly TimeSpan MaxBackoff = TimeSpan.FromMinutes(30);

    /// <summary>Ancho de <c>alert_outbox.last_error</c>.</summary>
    public const int LastErrorMaxLength = 500;

    /// <summary>
    /// Pendientes con más de siete días se marcan <c>failed</c>: ya no son accionables. No borra
    /// nada, y no toca filas <c>sent</c> ni <c>failed</c>.
    /// </summary>
    public const string ExpireStalePendingSql = """
        UPDATE alert_outbox
        SET status = 'failed', last_error = 'expired', updated_at = NOW()
        WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days'
        """;

    /// <summary>Retroceso exponencial desde 30 s, acotado en <see cref="MaxBackoff"/>.</summary>
    public static TimeSpan Backoff(int attempts)
    {
        var seconds = Math.Min(
            Math.Pow(2, Math.Clamp(attempts, 1, 10)) * 30,
            MaxBackoff.TotalSeconds);

        return TimeSpan.FromSeconds(seconds);
    }

    /// <summary>
    /// Decide el destino de una entrega que acaba de fallar, con <paramref name="attempts"/> ya
    /// incrementado. En el último intento permitido la fila se cierra; antes, se reprograma.
    /// </summary>
    public static AlertDispatchFailure Decide(
        int attempts,
        int maxAttempts,
        string errorType,
        DateTimeOffset nowUtc)
    {
        if (attempts >= maxAttempts)
        {
            return new AlertDispatchFailure(true, MaxAttemptsError, NextAttemptAt: null);
        }

        return new AlertDispatchFailure(false, Truncate(errorType), nowUtc + Backoff(attempts));
    }

    /// <summary>Recorta el error al ancho de la columna.</summary>
    public static string Truncate(string value) =>
        value.Length <= LastErrorMaxLength ? value : value[..LastErrorMaxLength];
}
