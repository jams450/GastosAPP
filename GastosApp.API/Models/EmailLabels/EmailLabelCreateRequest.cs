namespace GastosApp.API.Models.EmailLabels;

public class EmailLabelCreateRequest
{
    public string Name { get; set; } = string.Empty;

    /// <summary>Opcional: si viene vacío se deriva del nombre.</summary>
    public string? Slug { get; set; }

    public string Kind { get; set; } = "folder";

    public string Behavior { get; set; } = "none";

    /// <summary>
    /// Qué correo pertenece a esta etiqueta. Es lo que el respaldo LLM lee para elegir entre las
    /// etiquetas reales; el motor determinista la ignora.
    /// </summary>
    public string? Description { get; set; }

    public string? Color { get; set; }

    public int SortOrder { get; set; }

    public bool Active { get; set; } = true;
}
