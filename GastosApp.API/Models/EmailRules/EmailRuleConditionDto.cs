namespace GastosApp.API.Models.EmailRules;

/// <summary>Una condición del árbol. El valor se normaliza al guardar, igual que en el modelo plano.</summary>
public class EmailRuleConditionDto
{
    /// <summary>sender | sender_domain | subject</summary>
    public string MatchField { get; set; } = string.Empty;

    /// <summary>equals | contains | starts_with | ends_with</summary>
    public string MatchType { get; set; } = string.Empty;

    public string MatchValue { get; set; } = string.Empty;

    /// <summary>
    /// Invierte el resultado de esta condición. Ausente en las peticiones anteriores a S14, así que el
    /// valor por defecto es «no negar»: la regla guardada sigue significando lo mismo.
    /// </summary>
    public bool Negated { get; set; }
}
