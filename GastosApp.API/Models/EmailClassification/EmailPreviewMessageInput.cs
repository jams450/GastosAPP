namespace GastosApp.API.Models.EmailClassification;

/// <summary>Un mensaje crudo, tal como se copia de un <c>.eml</c>. Solo se leen cabeceras.</summary>
public class EmailPreviewMessageInput
{
    public string? Name { get; set; }

    public string Raw { get; set; } = string.Empty;
}
