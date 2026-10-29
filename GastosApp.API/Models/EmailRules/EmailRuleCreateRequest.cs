namespace GastosApp.API.Models.EmailRules;

public class EmailRuleCreateRequest
{
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Árbol AND/OR de la regla. Si viene, manda sobre los campos planos de abajo; si no, la regla se
    /// guarda con una sola condición (forma anterior) para que la pantalla vieja siga funcionando.
    /// </summary>
    public EmailRuleGroupDto? Root { get; set; }

    /// <summary>sender | sender_domain | subject</summary>
    public string MatchField { get; set; } = string.Empty;

    /// <summary>equals | contains | starts_with | ends_with</summary>
    public string MatchType { get; set; } = string.Empty;

    public string MatchValue { get; set; } = string.Empty;

    public int TargetLabelId { get; set; }

    public int Priority { get; set; } = 100;

    public bool Active { get; set; } = true;
}
