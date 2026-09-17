namespace GastosApp.API.Models.CatalogRules;

public class CatalogRuleCreateRequest
{
    public string Name { get; set; } = string.Empty;

    public string MatchType { get; set; } = string.Empty;

    public string MatchValue { get; set; } = string.Empty;

    public int? TargetCategoryId { get; set; }

    public int? TargetSubcategoryId { get; set; }

    public int Priority { get; set; } = 100;

    public bool Active { get; set; } = true;
}
