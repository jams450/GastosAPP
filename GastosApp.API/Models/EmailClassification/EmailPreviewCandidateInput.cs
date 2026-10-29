namespace GastosApp.API.Models.EmailClassification;

/// <summary>
/// Candidato escrito a mano, para probar una regla sin tener un correo a la vista. Sirve también
/// para el caso que más se repite al ajustar reglas: cambiar el remitente y ver si sigue casando.
/// </summary>
public class EmailPreviewCandidateInput
{
    public string? Name { get; set; }

    public string? SenderAddress { get; set; }

    public string? SenderDomain { get; set; }

    public string? Subject { get; set; }

    /// <summary>Opcional: sin fecha no se aplica el corte de antigüedad.</summary>
    public DateTime? ReceivedAt { get; set; }

    public string? BodyText { get; set; }
}
