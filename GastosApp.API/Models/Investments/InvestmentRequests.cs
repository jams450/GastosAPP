namespace GastosApp.API.Models.Investments;

public sealed class InvestmentTierRequest { public decimal MinimumAmount { get; set; } public decimal? MaximumAmount { get; set; } public decimal AnnualRatePercent { get; set; } }
public sealed class InvestmentOfferRequest { public string CapturedForMonth { get; set; } = string.Empty; public DateOnly ValidFrom { get; set; } public DateOnly ValidTo { get; set; } public string SourceUrl { get; set; } = string.Empty; public string SourceLabel { get; set; } = string.Empty; public bool ConditionsConfirmed { get; set; } public List<InvestmentTierRequest> Tiers { get; set; } = []; }
public sealed class InvestmentProductRequest { public int AccountId { get; set; } public string Name { get; set; } = string.Empty; public string Institution { get; set; } = string.Empty; public bool Active { get; set; } = true; public List<InvestmentOfferRequest> Offers { get; set; } = []; }
public sealed class InvestmentProductActiveRequest { public bool Active { get; set; } }
public sealed class InvestmentPlanGenerateRequest { public string PlanMonth { get; set; } = string.Empty; public int ProjectionMonths { get; set; } = 12; }
