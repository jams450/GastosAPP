namespace GastosApp.API.Models.EmailClassification;

/// <summary>
/// Resultado de la muestra. Los descartes se reportan por separado para que un asunto vacío no se
/// confunda con un rango de fechas mal escrito.
/// </summary>
public class EmailPreviewResponse
{
    public int Total { get; set; }
    public int Returned { get; set; }
    public int Unreadable { get; set; }
    public int SkippedOutOfRange { get; set; }
    public int SkippedByLimit { get; set; }
    public int DropOlderThanDays { get; set; }
    public List<EmailPreviewRow> Rows { get; set; } = new();
}
