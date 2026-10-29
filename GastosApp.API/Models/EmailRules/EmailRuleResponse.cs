namespace GastosApp.API.Models.EmailRules;

public class EmailRuleResponse
{
    public int EmailRuleId { get; set; }
    public int UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string MatchField { get; set; } = string.Empty;
    public string MatchType { get; set; } = string.Empty;
    public string MatchValue { get; set; } = string.Empty;
    public int TargetLabelId { get; set; }
    public string? TargetLabelName { get; set; }
    public string? TargetLabelBehavior { get; set; }
    public int Priority { get; set; }
    public bool Active { get; set; }
}
