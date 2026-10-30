namespace GastosApp.API.Services.Email;

/// <summary>Estado observable del cursor: de qué cuenta es y cuál fue el último UID leído.</summary>
public sealed record EmailIngestCursorState(
    string? AccountFingerprint,
    uint UidValidity,
    uint? LastScannedUid);

/// <summary>
/// Ventana acotada de UIDs a leer en una corrida. Función pura sobre una lista ordenada.
/// </summary>
public static class EmailIngestWindow
{
    /// <summary>Tope duro de mensajes examinados por corrida, independiente de la configuración.</summary>
    public const int MaxScannedPerRun = 200;

    /// <summary>
    /// Elige hasta <paramref name="maxMessages"/> UIDs empezando después de <paramref name="lastScannedUid"/>.
    /// Si la lista se termina antes del tope, da UNA sola vuelta al principio y no repite ningún UID.
    /// Es lo que evita que un correo sin veredicto ocupe para siempre el mismo tramo «más nuevo».
    /// </summary>
    public static IReadOnlyList<uint> Select(IReadOnlyList<uint> sortedUids, uint? lastScannedUid, int maxMessages)
    {
        ArgumentNullException.ThrowIfNull(sortedUids);

        if (sortedUids.Count == 0)
        {
            return Array.Empty<uint>();
        }

        var take = Math.Clamp(maxMessages, 1, MaxScannedPerRun);
        var count = Math.Min(take, sortedUids.Count);
        var start = 0;

        if (lastScannedUid is uint last)
        {
            while (start < sortedUids.Count && sortedUids[start] <= last)
            {
                start++;
            }

            // Se terminó la lista: la vuelta empieza en el principio.
            if (start == sortedUids.Count)
            {
                start = 0;
            }
        }

        var window = new uint[count];
        for (var index = 0; index < count; index++)
        {
            // Una sola vuelta: el índice recorre la lista completa y nunca repite un UID.
            window[index] = sortedUids[(start + index) % sortedUids.Count];
        }

        return window;
    }
}

/// <summary>
/// Cursor en memoria del pase diario. No persiste nada: un reinicio puede volver a leer correo ya
/// visto, que es seguro porque solo se AGREGA una etiqueta idempotente.
/// <para>
/// Está atado a la cuenta y al UIDVALIDITY: si cualquiera cambia, el UID anterior no nombra el mismo
/// buzón y el cursor se reinicia en lugar de saltarse correo ajeno. Hay una sola cuenta configurada,
/// así que no guarda un mapa de cuentas.
/// </para>
/// </summary>
public sealed class EmailIngestCursor
{
    private readonly object _gate = new();
    private string? _fingerprint;
    private uint _uidValidity;
    private uint? _lastScannedUid;

    /// <summary>Copia estable del estado, segura para leer desde otra corrida.</summary>
    public EmailIngestCursorState Current
    {
        get
        {
            lock (_gate)
            {
                return new EmailIngestCursorState(_fingerprint, _uidValidity, _lastScannedUid);
            }
        }
    }

    /// <summary>
    /// Registra el último UID leído. Con otra cuenta u otro UIDVALIDITY reinicia el estado; con la
    /// misma identidad y sin UID conserva el avance anterior.
    /// </summary>
    public void Advance(string? accountFingerprint, uint uidValidity, uint? lastScannedUid)
    {
        var fingerprint = accountFingerprint ?? string.Empty;

        lock (_gate)
        {
            if (!string.Equals(_fingerprint, fingerprint, StringComparison.Ordinal) || _uidValidity != uidValidity)
            {
                // Otra cuenta u otro UIDVALIDITY: los UID anteriores no nombran este buzón.
                _fingerprint = fingerprint;
                _uidValidity = uidValidity;
                _lastScannedUid = lastScannedUid;
                return;
            }

            // Sin ventana (por ejemplo, sin coincidencias) se conserva el avance anterior.
            if (lastScannedUid.HasValue)
            {
                _lastScannedUid = lastScannedUid;
            }
        }
    }
}
