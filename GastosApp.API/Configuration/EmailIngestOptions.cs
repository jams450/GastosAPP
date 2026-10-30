namespace GastosApp.API.Configuration;

/// <summary>
/// Configuración del pase diario de etiquetado del correo (<c>Email:Ingest</c>).
/// <para>
/// Nace apagado y sin dueño: encenderlo es una decisión del usuario, no un valor por defecto. Una
/// sección incompleta no bloquea el arranque de la API; el job simplemente no corre y lo registra.
/// </para>
/// <para>
/// Claves: <c>Email:Ingest:Enabled</c> (bool, <c>false</c>), <c>Email:Ingest:UserId</c> (int positivo
/// y obligatorio, <c>0</c>), <c>Email:Ingest:HourUtc</c> (0–23, <c>12</c>) y
/// <c>Email:Ingest:MaxMessages</c> (1–200, <c>50</c>).
/// </para>
/// </summary>
public sealed class EmailIngestOptions
{
    public const string SectionName = "Email:Ingest";

    /// <summary>Con <c>false</c> el job no arranca y no se lee ningún buzón.</summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Dueño del pase. Es obligatorio y debe ser positivo: no se infiere del usuario 1 ni de la
    /// identidad de Telegram. Sin un dueño explícito el job no corre.
    /// </summary>
    public int UserId { get; set; }

    /// <summary>Hora UTC de la corrida diaria. El job espera a la siguiente ocurrencia.</summary>
    public int HourUtc { get; set; } = 12;

    /// <summary>Tope de mensajes leídos por corrida. Se acota a 1–200 al ejecutar.</summary>
    public int MaxMessages { get; set; } = 50;
}
