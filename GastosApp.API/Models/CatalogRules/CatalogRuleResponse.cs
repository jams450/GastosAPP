namespace GastosApp.API.Models.CatalogRules;

public class CatalogRuleResponse
{
    public int RuleId { get; set; }
    public int UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string MatchType { get; set; } = string.Empty;
    public string MatchValue { get; set; } = string.Empty;
    public int? TargetCategoryId { get; set; }
    public int? TargetSubcategoryId { get; set; }
    public int Priority { get; set; }
    public bool Active { get; set; }
}
