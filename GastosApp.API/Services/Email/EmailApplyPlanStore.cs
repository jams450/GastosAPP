using System.Security.Cryptography;

namespace GastosApp.API.Services.Email;

/// <summary>
/// Planes pendientes en memoria, indexados por un token opaco. Tres decisiones sostienen el diseño:
/// <list type="bullet">
/// <item><b>Nada persistente</b>: sin tabla, sin esquema y sin clave. Un reinicio invalida los tokens,
/// que es el comportamiento correcto: el plan vivía junto a la muestra revisada, no en la base.</item>
/// <item><b>Un solo uso</b>: canjear el token lo borra. Un segundo intento no aplica dos veces.</item>
/// <item><b>De un solo dueño</b>: el token está atado al usuario que generó el plan. Un token ajeno
/// no se canjea y tampoco se consume, para que su dueño todavía pueda usarlo.</item>
/// </list>
/// La memoria está acotada: 200 planes y 15 minutos. Un token olvidado no crece sin límite.
/// </summary>
public sealed class EmailApplyPlanStore
{
    public const int MaxPendingPlans = 200;

    public static readonly TimeSpan PlanTtl = TimeSpan.FromMinutes(15);

    private readonly TimeProvider _timeProvider;
    private readonly object _gate = new();
    private readonly Dictionary<string, Entry> _plans = new(StringComparer.Ordinal);

    public EmailApplyPlanStore(TimeProvider timeProvider)
    {
        _timeProvider = timeProvider ?? throw new ArgumentNullException(nameof(timeProvider));
    }

    /// <summary>
    /// Guarda el plan y devuelve el token. El token son 32 bytes aleatorios en base64url: no adivina
    /// nada del plan, ni el buzón, ni el usuario, ni las etiquetas.
    /// </summary>
    public EmailApplyTicket Store(EmailApplyPlan plan)
    {
        ArgumentNullException.ThrowIfNull(plan);

        var now = _timeProvider.GetUtcNow();
        var token = CreateToken();

        lock (_gate)
        {
            PurgeExpired(now);

            if (_plans.Count >= MaxPendingPlans)
            {
                // El más viejo se descarta: es el que menos probabilidad tiene de seguir en pantalla.
                var oldest = _plans.MinBy(pair => pair.Value.CreatedAt).Key;
                _plans.Remove(oldest);
            }

            _plans[token] = new Entry(plan, now.Add(PlanTtl), now);
        }

        return new EmailApplyTicket(token, now.Add(PlanTtl));
    }

    /// <summary>
    /// Canjea el token. Solo lo consume el dueño del plan: si el token es de otro usuario se informa
    /// el rechazo y se deja intacto, porque un error de sesión no debe quemar el trabajo de nadie.
    /// </summary>
    public EmailApplyTake Take(string? token, int userId)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return EmailApplyTake.Missing;
        }

        var now = _timeProvider.GetUtcNow();

        lock (_gate)
        {
            if (!_plans.TryGetValue(token.Trim(), out var entry))
            {
                return EmailApplyTake.Missing;
            }

            if (entry.ExpiresAt <= now)
            {
                _plans.Remove(token.Trim());
                return EmailApplyTake.Expired;
            }

            if (entry.Plan.UserId != userId)
            {
                return EmailApplyTake.WrongUser;
            }

            _plans.Remove(token.Trim());
            return EmailApplyTake.Taken(entry.Plan);
        }
    }

    /// <summary>Planes pendientes vivos. Se usa en pruebas y diagnósticos.</summary>
    public int PendingCount
    {
        get
        {
            lock (_gate)
            {
                PurgeExpired(_timeProvider.GetUtcNow());
                return _plans.Count;
            }
        }
    }

    private void PurgeExpired(DateTimeOffset now)
    {
        foreach (var pair in _plans.Where(pair => pair.Value.ExpiresAt <= now).ToList())
        {
            _plans.Remove(pair.Key);
        }
    }

    private static string CreateToken()
    {
        // base64url sin relleno: seguro en URL, en formulario y en encabezados, y sin caracteres que
        // un lector de pantalla o una copia descuidada puedan perder.
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    private sealed record Entry(EmailApplyPlan Plan, DateTimeOffset ExpiresAt, DateTimeOffset CreatedAt);
}
