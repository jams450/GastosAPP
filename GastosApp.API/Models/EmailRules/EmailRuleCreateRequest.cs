namespace GastosApp.API.Models.EmailRules;

public class EmailRuleCreateRequest
{
    public string Name { get; set; } = string.Empty;

    /// <summary>sender | sender_domain | subject</summary>
    public string MatchField { get; set; } = string.Empty;

    /// <summary>equals | contains | starts_with | ends_with</summary>
    public string MatchType { get; set; } = string.Empty;

    public string MatchValue { get; set; } = string.Empty;

    public int TargetLabelId { get; set; }

    public int Priority { get; set; } = 100;

    public bool Active { get; set; } = true;
}
