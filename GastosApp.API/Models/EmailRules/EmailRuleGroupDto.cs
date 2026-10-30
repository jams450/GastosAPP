namespace GastosApp.API.Models.EmailRules;

/// <summary>
/// Grupo booleano: combina con su operador a sus condiciones y a sus subgrupos. El árbol se envía y se
/// devuelve completo, así el editor puede reconstruirlo tal como quedó guardado.
/// </summary>
public class EmailRuleGroupDto
{
    /// <summary>and | or</summary>
    public string Combinator { get; set; } = "and";

    /// <summary>Invierte el resultado del grupo ya combinado, nunca el de cada hijo.</summary>
    public bool Negated { get; set; }

    public List<EmailRuleConditionDto> Conditions { get; set; } = new();

    public List<EmailRuleGroupDto> Groups { get; set; } = new();
}
