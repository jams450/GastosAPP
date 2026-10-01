using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Investments;

public sealed class InvestmentTierRequest
{
    public decimal MinimumAmount { get; set; }
    public decimal? MaximumAmount { get; set; }
    public decimal AnnualRatePercent { get; set; }

    /// <summary>Optional literal special condition attached to this tier (max 1000 characters).</summary>
    [MaxLength(1000)]
    public string? SpecialConditionText { get; set; }
}

public sealed class InvestmentOfferRequest
{
    public string CapturedForMonth { get; set; } = string.Empty;
    public DateOnly ValidFrom { get; set; }

    /// <summary>Optional. When omitted the service infers December 31 of the capture year.</summary>
    public DateOnly? ValidTo { get; set; }

    public string SourceUrl { get; set; } = string.Empty;
    public string SourceLabel { get; set; } = string.Empty;

    /// <summary>Optional literal offer-level terms text (max 1000 characters).</summary>
    [MaxLength(1000)]
    public string? TermsText { get; set; }

    public bool ConditionsConfirmed { get; set; }
    public List<InvestmentTierRequest> Tiers { get; set; } = [];
}

public sealed class InvestmentProductRequest
{
    public int AccountId { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>One of: revolut, cetes, nu, klar, finsus, didi, mercado_libre (case-insensitive).</summary>
    public string Institution { get; set; } = string.Empty;

    public bool Active { get; set; } = true;
    public List<InvestmentOfferRequest> Offers { get; set; } = [];
}

public sealed class InvestmentProductActiveRequest
{
    public bool Active { get; set; }
}

public sealed class InvestmentPlanGenerateRequest
{
    public string PlanMonth { get; set; } = string.Empty;

    /// <summary>Mirrors the service limits (<c>MinProjectionMonths</c>/<c>MaxProjectionMonths</c>), which stay authoritative.</summary>
    [Range(1, 24)]
    public int ProjectionMonths { get; set; } = 12;

    /// <summary>
    /// Explicit per-tier attestation for every tier that declares special condition text. A missing
    /// confirmation makes the product ineligible; it is never carried over from a previous plan.
    /// </summary>
    public List<int> ConfirmedTierIds { get; set; } = [];
}
