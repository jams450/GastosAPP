namespace GastosApp.API.Models.EmailClassification;

/// <summary>
/// Veredicto de un correo en la muestra. Incluye <see cref="ProjectedState"/> para que se vea qué
/// escribiría una corrida real, sin haber escrito nada.
/// </summary>
public class EmailPreviewRow
{
    public string Name { get; set; } = string.Empty;
    public string? SenderAddress { get; set; }
    public string? SenderDomain { get; set; }
    public string? Subject { get; set; }
    public DateTime? ReceivedAt { get; set; }
    public string Outcome { get; set; } = string.Empty;
    public string? LabelSlug { get; set; }
    public string? LabelBehavior { get; set; }
    public string? MatchedRuleName { get; set; }
    public string ClassifiedBy { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string ProjectedState { get; set; } = string.Empty;
}
