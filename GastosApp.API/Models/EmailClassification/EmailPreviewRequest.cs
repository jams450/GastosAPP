namespace GastosApp.API.Models.EmailClassification;

/// <summary>
/// Entrada del módulo de prueba. Ninguna de las dos listas escribe nada: el módulo clasifica y
/// devuelve el veredicto, sin registrar mensajes ni crear borradores.
/// </summary>
public class EmailPreviewRequest
{
    public List<EmailPreviewMessageInput>? Messages { get; set; }

    public List<EmailPreviewCandidateInput>? Candidates { get; set; }

    /// <summary>Tope de la muestra. Por defecto 50, máximo 200.</summary>
    public int? MaxItems { get; set; }

    /// <summary>
    /// Buzón o etiqueta de Gmail que se lee por IMAP. Si viene, la muestra se toma del correo real
    /// (solo lectura) además de lo que se haya cargado a mano.
    /// </summary>
    public string? Mailbox { get; set; }

    /// <summary>Descarta lo anterior a esta fecha, si el candidato trae fecha.</summary>
    public DateTime? From { get; set; }

    /// <summary>Descarta lo posterior a esta fecha, si el candidato trae fecha.</summary>
    public DateTime? To { get; set; }
}
