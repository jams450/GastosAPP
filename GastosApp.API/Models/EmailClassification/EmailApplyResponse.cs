namespace GastosApp.API.Models.EmailClassification;

/// <summary>
/// Resultado de aplicar la muestra revisada. Los conteos se derivan de las filas: se informan por
/// separado porque «omitida» (la etiqueta no existe, o el mensaje ya la tenía) y «falló» (no se pudo
/// confirmar) piden acciones distintas de la persona.
/// </summary>
public class EmailApplyResponse
{
    public List<EmailApplyRow> Rows { get; set; } = new();

    public int Applied { get; set; }

    public int Skipped { get; set; }

    public int Failed { get; set; }
}
