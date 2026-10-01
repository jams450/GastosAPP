namespace GastosApp.BusinessLogic.Models.Investments;

/// <summary>Product/tier input coming from the API layer (already user-scoped, no ids accepted).</summary>
public sealed class InvestmentTierInput
{
    public decimal MinimumAmount { get; set; }
    public decimal? MaximumAmount { get; set; }
    public decimal AnnualRatePercent { get; set; }

    /// <summary>Literal commercial condition text. Never parsed, never interpreted, never generated.</summary>
    public string? SpecialConditionText { get; set; }
}

public sealed class InvestmentOfferInput
{
    public string CapturedForMonth { get; set; } = string.Empty;
    public DateOnly ValidFrom { get; set; }

    /// <summary>
    /// Declared validity end. When null the service infers December 31 of the capture year and marks
    /// the offer as having inferred validity; a rate is never inferred in either case.
    /// </summary>
    public DateOnly? ValidTo { get; set; }

    public string SourceUrl { get; set; } = string.Empty;
    public string SourceLabel { get; set; } = string.Empty;

    /// <summary>Literal offer-level terms text (for example the campaign or promotional wording).</summary>
    public string? TermsText { get; set; }

    public bool ConditionsConfirmed { get; set; }
    public List<InvestmentTierInput> Tiers { get; set; } = [];
}

public sealed class InvestmentProductInput
{
    public int AccountId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Institution { get; set; } = string.Empty;
    public bool Active { get; set; } = true;
    public List<InvestmentOfferInput> Offers { get; set; } = [];
}

/// <summary>
/// Generation request. <see cref="ConfirmedTierIds"/> is the explicit per-tier attestation for every
/// tier that declares special condition text; generation is rejected when a required confirmation is
/// missing. The service never infers confirmations from previous plans.
/// </summary>
public sealed class InvestmentPlanGenerateInput
{
    public string PlanMonth { get; set; } = string.Empty;
    public int ProjectionMonths { get; set; } = 12;
    public List<int> ConfirmedTierIds { get; set; } = [];
}

// ---------------------------------------------------------------------------------------------
// Response contracts. Purpose-built DTOs: no EF entities or navigation graphs leave the service.
// ---------------------------------------------------------------------------------------------

public sealed class InvestmentTierResult
{
    public int InvestmentRateTierId { get; init; }
    public decimal MinimumAmount { get; init; }
    public decimal? MaximumAmount { get; init; }
    public decimal AnnualRatePercent { get; init; }
    public string? SpecialConditionText { get; init; }
}

public sealed class InvestmentOfferResult
{
    public int InvestmentOfferId { get; init; }
    public string CapturedForMonth { get; init; } = string.Empty;
    public DateOnly ValidFrom { get; init; }
    public DateOnly ValidTo { get; init; }
    public bool ValidityInferred { get; init; }
    public string SourceUrl { get; init; } = string.Empty;
    public string SourceLabel { get; init; } = string.Empty;
    public string? TermsText { get; init; }
    public bool ConditionsConfirmed { get; init; }
    public List<InvestmentTierResult> Tiers { get; init; } = [];
}

public sealed class InvestmentProductResult
{
    public int InvestmentProductId { get; init; }
    public int AccountId { get; init; }
    public string? AccountName { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Institution { get; init; } = string.Empty;
    public string InstitutionLabel { get; init; } = string.Empty;
    public bool Active { get; init; }
    public List<InvestmentOfferResult> Offers { get; init; } = [];
}

/// <summary>Machine-readable exclusion reasons. Never a rate, never a guess.</summary>
public static class InvestmentExclusionReasons
{
    public const string InactiveProduct = "inactive_product";
    public const string UnsupportedInstitution = "unsupported_institution";
    public const string NoOfferForMonth = "no_offer_for_month";
    public const string OfferNotCapturedForMonth = "offer_not_captured_for_month";
    public const string ValidityNotCoveringMonth = "validity_not_covering_month";
    public const string ConditionsNotConfirmed = "conditions_not_confirmed";
    public const string InvalidOrMissingTiers = "invalid_or_missing_tiers";
}

/// <summary>
/// Offer freshness states surfaced for a derived draft.
///
/// A draft partitions the catalog with the same rules generation uses, so a draft allocation always
/// holds an offer captured for the target month whose validity covers it: <see cref="Current"/> is the
/// only state a draft allocation can carry. The remaining states are kept in the contract (and the
/// frontend still fails closed on them) because they are the human-readable counterpart of the
/// machine-readable exclusions a draft now reports instead of presenting an unusable offer.
/// </summary>
public static class InvestmentOfferFreshness
{
    /// <summary>An offer captured for the requested month whose validity covers the month start.</summary>
    public const string Current = "current";

    /// <summary>Offers exist but were captured in an earlier month, or their validity does not cover the month. Reported by a draft as <see cref="InvestmentExclusionReasons.OfferNotCapturedForMonth"/> or <see cref="InvestmentExclusionReasons.ValidityNotCoveringMonth"/>.</summary>
    public const string Stale = "stale";

    /// <summary>The product has no offers at all; a draft reports <see cref="InvestmentExclusionReasons.NoOfferForMonth"/>.</summary>
    public const string Missing = "missing";

    /// <summary>The linked product is inactive; a draft reports <see cref="InvestmentExclusionReasons.InactiveProduct"/>.</summary>
    public const string Inactive = "inactive";
}

public sealed class InvestmentExclusionResult
{
    public int InvestmentProductId { get; init; }
    public string ProductName { get; init; } = string.Empty;
    public string Institution { get; init; } = string.Empty;
    public string InstitutionLabel { get; init; } = string.Empty;
    public string Reason { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
}

/// <summary>A condition that still needs an explicit per-tier confirmation before generation.</summary>
public sealed class InvestmentPendingConditionResult
{
    public int InvestmentProductId { get; init; }
    public int InvestmentOfferId { get; init; }
    public int InvestmentRateTierId { get; init; }
    public string SpecialConditionText { get; init; } = string.Empty;
}

/// <summary>Tier as it was used by a persisted allocation, or as the current catalog defines it for a draft.</summary>
public sealed class InvestmentAllocationTierResult
{
    public int InvestmentRateTierId { get; init; }
    public decimal MinimumAmount { get; init; }
    public decimal? MaximumAmount { get; init; }
    public decimal AnnualRatePercent { get; init; }
    public string? SpecialConditionText { get; init; }
    public bool ConditionConfirmed { get; init; }
}

/// <summary>Shared traceability of one allocation, without the monthly series.</summary>
public abstract class InvestmentAllocationBaseResult
{
    public int InvestmentProductId { get; init; }
    public int AccountId { get; init; }
    public string ProductName { get; init; } = string.Empty;
    public string Institution { get; init; } = string.Empty;
    public string InstitutionLabel { get; init; } = string.Empty;
    public decimal AllocatedAmount { get; init; }
    public string OfferCapturedForMonth { get; init; } = string.Empty;
    public DateOnly OfferValidFrom { get; init; }
    public DateOnly OfferValidTo { get; init; }
    public bool ValidityInferred { get; init; }
    public string OfferSourceUrl { get; init; } = string.Empty;
    public string OfferSourceLabel { get; init; } = string.Empty;
    public string? TermsText { get; init; }
    public bool ConditionsConfirmed { get; init; }

    /// <summary>Null for a persisted plan; the draft freshness state otherwise.</summary>
    public string? OfferFreshness { get; init; }

    public List<InvestmentPendingConditionResult> PendingConditions { get; init; } = [];
    public List<InvestmentAllocationTierResult> Tiers { get; init; } = [];
}

/// <summary>Plan detail: identity, allocations and exclusions. Deliberately has no monthly series.</summary>
public sealed class InvestmentAllocationResult : InvestmentAllocationBaseResult;

/// <summary>Projection row of one allocation.</summary>
public sealed class InvestmentAllocationProjectionResult : InvestmentAllocationBaseResult
{
    public List<InvestmentProjectionRow> Projection { get; init; } = [];
}

public sealed class InvestmentPlanResult
{
    public int InvestmentPlanId { get; init; }
    public string PlanMonth { get; init; } = string.Empty;
    public int ProjectionMonths { get; init; }

    /// <summary>True when the row exists in the database; false when this is a derived, never-persisted draft.</summary>
    public bool IsPersisted { get; init; }

    public int? CarriedFromPlanId { get; init; }
    public string? CarriedFromPlanMonth { get; init; }
    public List<InvestmentAllocationResult> Allocations { get; init; } = [];
    public List<InvestmentExclusionResult> Exclusions { get; init; } = [];
}

public sealed class InvestmentPlanProjectionResult
{
    public int InvestmentPlanId { get; init; }
    public string PlanMonth { get; init; } = string.Empty;
    public int ProjectionMonths { get; init; }
    public bool IsPersisted { get; init; }
    public List<InvestmentAllocationProjectionResult> Allocations { get; init; } = [];
    public List<InvestmentExclusionResult> Exclusions { get; init; } = [];
}

public sealed class InvestmentProjectionRow
{
    public int MonthNumber { get; init; }
    public string Month { get; init; } = string.Empty;
    public decimal OpeningBalance { get; init; }
    public decimal Interest { get; init; }
    public decimal ClosingBalance { get; init; }
}

/// <summary>Serialized shape of one persisted allocation tier snapshot.</summary>
public sealed class InvestmentTierSnapshot
{
    public int InvestmentRateTierId { get; set; }
    public decimal MinimumAmount { get; set; }
    public decimal? MaximumAmount { get; set; }
    public decimal AnnualRatePercent { get; set; }
    public string? SpecialConditionText { get; set; }
    public bool ConditionConfirmed { get; set; }
}
