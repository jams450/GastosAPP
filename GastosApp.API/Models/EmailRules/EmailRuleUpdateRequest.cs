using GastosApp.Models.Entities;

namespace GastosApp.API.Models.EmailRules;

public class EmailRuleUpdateRequest
{
    public string Name { get; set; } = string.Empty;

    /// <summary>assign_label | review | llm. Por defecto asignar etiqueta, como antes de S15.</summary>
    public string Action { get; set; } = EmailRuleAction.AssignLabel;

    /// <summary>Árbol AND/OR; si viene, reemplaza por completo a los campos planos.</summary>
    public EmailRuleGroupDto? Root { get; set; }

    public string MatchField { get; set; } = string.Empty;

    public string MatchType { get; set; } = string.Empty;

    public string MatchValue { get; set; } = string.Empty;

    /// <summary>Etiqueta destino. Nula (o ignorada) en las acciones terminales.</summary>
    public int? TargetLabelId { get; set; }

    public int Priority { get; set; } = 100;

    public bool Active { get; set; } = true;
}
