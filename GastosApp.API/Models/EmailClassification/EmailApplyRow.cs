namespace GastosApp.API.Models.EmailClassification;

/// <summary>
/// Una fila del resultado de aplicar. <see cref="Status"/> es <c>applied</c>, <c>skipped</c> o
/// <c>failed</c>; <see cref="Message"/> explica el caso en español, para que «omitida» no se confunda
/// con «falló».
/// </summary>
public class EmailApplyRow
{
    public string Name { get; set; } = string.Empty;

    /// <summary>Etiqueta destino tal como se llamó en el plan (nombre exacto de la carpeta de Gmail).</summary>
    public string Label { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;
}
