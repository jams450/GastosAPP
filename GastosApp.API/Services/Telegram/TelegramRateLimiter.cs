using System.Collections.Concurrent;

namespace GastosApp.API.Services.Telegram;

/// <summary>
/// Límite simple en memoria por identidad de Telegram. Se registra como singleton: el estado
/// debe sobrevivir al request. Nunca limpia todo el diccionario en bloque; solo descarta
/// ventanas vencidas.
/// ponytail: límite por proceso, sustituir por almacén distribuido si se escala a varias réplicas.
/// </summary>
public sealed class TelegramRateLimiter
{
    private const int MaxRequestsPerWindow = 20;
    private const int PruneThreshold = 1_000;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    private readonly ConcurrentDictionary<int, Counter> _counters = new();

    public bool TryAcquire(int telegramIdentityId)
    {
        var now = DateTime.UtcNow;
        var counter = _counters.GetOrAdd(telegramIdentityId, _ => new Counter { WindowStart = now });

        bool allowed;
        lock (counter)
        {
            if (now - counter.WindowStart >= Window)
            {
                counter.WindowStart = now;
                counter.Count = 0;
            }

            allowed = counter.Count < MaxRequestsPerWindow;
            if (allowed)
            {
                counter.Count++;
            }
        }

        if (_counters.Count > PruneThreshold)
        {
            Prune(now);
        }

        return allowed;
    }

    private void Prune(DateTime now)
    {
        // Solo elimina ventanas vencidas; no toca las activas de otras identidades.
        foreach (var entry in _counters)
        {
            var expired = false;
            lock (entry.Value)
            {
                expired = now - entry.Value.WindowStart >= Window;
            }

            if (expired)
            {
                _counters.TryRemove(entry.Key, out _);
            }
        }
    }

    private sealed class Counter
    {
        public DateTime WindowStart;
        public int Count;
    }
}
