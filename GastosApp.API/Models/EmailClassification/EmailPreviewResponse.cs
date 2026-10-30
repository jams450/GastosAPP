namespace GastosApp.API.Models.EmailClassification;

/// <summary>
/// Resultado de la muestra. Los descartes se reportan por separado para que un asunto vacío no se
/// confunda con un rango de fechas mal escrito.
/// <para>
/// Cuando la muestra salió del buzón real y tiene filas aplicables, <see cref="ApplyToken"/> permite
/// aplicar <b>esa misma muestra</b> sin volver a buscar correo. Es nulo cuando no hay nada que aplicar
/// (solo archivos <c>.eml</c>, candidatos a mano, o ninguna fila clasificada con etiqueta).
/// </para>
/// </summary>
public class EmailPreviewResponse
{
    public int Total { get; set; }
    public int Returned { get; set; }
    public int Unreadable { get; set; }
    public int SkippedOutOfRange { get; set; }
    public int SkippedByLimit { get; set; }

    /// <summary>
    /// Filas del buzón que ya tenían la etiqueta destino de su regla y por eso no se muestran. Se
    /// cuentan aparte del resto de descartes para que el tope de la muestra no parezca una muestra
    /// incompleta: siguen dentro de <see cref="Total"/> porque sí se leyeron y se clasificaron.
    /// </summary>
    public int SkippedAlreadyLabelled { get; set; }
    public int DropOlderThanDays { get; set; }
    public List<EmailPreviewRow> Rows { get; set; } = new();

    /// <summary>
    /// Token opaco de un solo uso para aplicar las filas aplicables de esta muestra. No autoriza a
    /// leer el buzón de nuevo ni a ampliar la selección.
    /// </summary>
    public string? ApplyToken { get; set; }

    /// <summary>Vencimiento del token, en UTC. Quince minutos desde la vista previa.</summary>
    public DateTime? ApplyExpiresAt { get; set; }

    /// <summary>Filas aplicables de esta muestra: las del buzón que tienen etiqueta asignada.</summary>
    public int ApplicableCount { get; set; }
}
