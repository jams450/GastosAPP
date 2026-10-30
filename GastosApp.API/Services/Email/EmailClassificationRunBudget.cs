namespace GastosApp.API.Services.Email;

/// <summary>
/// Presupuesto de llamadas al LLM de UNA corrida: una muestra del módulo de prueba o una pasada del
/// job diario. Se construye una sola vez por corrida y se comparte entre todos los mensajes, porque
/// el tope existe para que un buzón grande no convierta el respaldo en la ruta principal.
/// <para>
/// Un contador por mensaje se reiniciaría en cada iteración y el tope nunca se alcanzaría; por eso el
/// objeto es explícito y el llamador lo pasa a cada verificación. La reserva es atómica: dos mensajes
/// no pueden gastar el mismo lugar aunque se clasifiquen en paralelo.
/// </para>
/// <para>
/// <c>0</c> desactiva todas las llamadas. Es el valor honesto cuando no hay orquestador LLM cableado:
/// no se promete un respaldo que no puede ocurrir.
/// </para>
/// </summary>
public sealed class EmailClassificationRunBudget
{
    /// <summary>Tope por defecto, igual que <c>Email:LlmMaxPerRun</c>.</summary>
    public const int DefaultMaxCalls = 20;

    /// <summary>Tope duro, aunque la configuración pida más.</summary>
    public const int HardMaxCalls = 200;

    private int _remaining;

    public EmailClassificationRunBudget(int maxCalls)
    {
        MaxCalls = Math.Clamp(maxCalls, 0, HardMaxCalls);
        _remaining = MaxCalls;
    }

    /// <summary>Tope efectivo de la corrida, ya acotado a <see cref="HardMaxCalls"/>.</summary>
    public int MaxCalls { get; }

    /// <summary>Lugares que quedan sin reservar.</summary>
    public int Remaining => Volatile.Read(ref _remaining);

    /// <summary>
    /// Reserva un lugar. Devuelve <c>false</c> cuando el presupuesto ya se agotó; quien llama debe
    /// tratar ese caso como revisión y NO invocar al modelo. La reserva se hace antes de la llamada,
    /// así que un intento que termina en error también consume su lugar.
    /// </summary>
    public bool TryReserve()
    {
        while (true)
        {
            var current = Volatile.Read(ref _remaining);
            if (current <= 0)
            {
                return false;
            }

            // CompareExchange: dos reservas concurrentes no pueden decrementar desde el mismo valor.
            if (Interlocked.CompareExchange(ref _remaining, current - 1, current) == current)
            {
                return true;
            }
        }
    }
}
