using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities;

[Table("investment_products")]
public class InvestmentProduct : BaseModel
{
    [Key]
    [Column("investment_product_id")]
    public int InvestmentProductId { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("account_id")]
    public int AccountId { get; set; }

    [Column("name")]
    [StringLength(120)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Canonical institution code from the seven-code V1 catalog. The database enforces the same
    /// catalog with <c>ck_investment_products_institution</c>; the service normalizes caller input.
    /// </summary>
    [Column("institution")]
    [StringLength(120)]
    public string Institution { get; set; } = string.Empty;

    [Column("active")]
    public bool Active { get; set; } = true;

    public Account Account { get; set; } = null!;
    public ICollection<InvestmentOffer> Offers { get; set; } = new List<InvestmentOffer>();
}

[Table("investment_offers")]
public class InvestmentOffer : BaseModel
{
    [Key]
    [Column("investment_offer_id")]
    public int InvestmentOfferId { get; set; }

    [Column("investment_product_id")]
    public int InvestmentProductId { get; set; }

    [Column("captured_for_month", TypeName = "char(7)")]
    [StringLength(7)]
    public string CapturedForMonth { get; set; } = string.Empty;

    [Column("valid_from")]
    public DateOnly ValidFrom { get; set; }

    /// <summary>
    /// Validity end. When the caller declares none, the service sets December 31 of the capture year
    /// and raises <see cref="ValidityInferred"/>. No rate is ever inferred.
    /// </summary>
    [Column("valid_to")]
    public DateOnly ValidTo { get; set; }

    /// <summary>True when <see cref="ValidTo"/> was derived instead of declared by the user or source.</summary>
    [Column("validity_inferred")]
    public bool ValidityInferred { get; set; }

    [Column("source_url")]
    [StringLength(500)]
    public string SourceUrl { get; set; } = string.Empty;

    [Column("source_label")]
    [StringLength(120)]
    public string SourceLabel { get; set; } = string.Empty;

    /// <summary>Literal offer-level terms text, copied as entered. Never parsed or interpreted.</summary>
    [Column("terms_text")]
    [StringLength(1000)]
    public string? TermsText { get; set; }

    [Column("conditions_confirmed")]
    public bool ConditionsConfirmed { get; set; }

    public InvestmentProduct Product { get; set; } = null!;
    public ICollection<InvestmentRateTier> Tiers { get; set; } = new List<InvestmentRateTier>();
}

[Table("investment_rate_tiers")]
public class InvestmentRateTier : BaseModel
{
    [Key]
    [Column("investment_rate_tier_id")]
    public int InvestmentRateTierId { get; set; }

    [Column("investment_offer_id")]
    public int InvestmentOfferId { get; set; }

    [Column("minimum_amount", TypeName = "decimal(15,2)")]
    public decimal MinimumAmount { get; set; }

    [Column("maximum_amount", TypeName = "decimal(15,2)")]
    public decimal? MaximumAmount { get; set; }

    [Column("annual_rate_percent", TypeName = "decimal(7,4)")]
    public decimal AnnualRatePercent { get; set; }

    /// <summary>
    /// Optional literal special condition attached to this tier (for example a minimum spend). When
    /// present, generation requires an explicit per-tier confirmation from the request.
    /// </summary>
    [Column("special_condition_text")]
    [StringLength(1000)]
    public string? SpecialConditionText { get; set; }

    public InvestmentOffer Offer { get; set; } = null!;
}

[Table("investment_plans")]
public class InvestmentPlan : BaseModel
{
    [Key]
    [Column("investment_plan_id")]
    public int InvestmentPlanId { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("plan_month", TypeName = "char(7)")]
    [StringLength(7)]
    public string PlanMonth { get; set; } = string.Empty;

    [Column("projection_months")]
    public int ProjectionMonths { get; set; }

    /// <summary>
    /// Serialized exclusions reported by the generation that produced this row. Kept as a snapshot so
    /// an already generated plan keeps explaining why each product was left out.
    /// </summary>
    [Column("exclusions_json", TypeName = "text")]
    public string ExclusionsJson { get; set; } = "[]";

    public ICollection<InvestmentPlanAllocation> Allocations { get; set; } = new List<InvestmentPlanAllocation>();
}

[Table("investment_plan_allocations")]
public class InvestmentPlanAllocation : BaseModel
{
    [Key]
    [Column("investment_plan_allocation_id")]
    public int InvestmentPlanAllocationId { get; set; }

    [Column("investment_plan_id")]
    public int InvestmentPlanId { get; set; }

    [Column("investment_product_id")]
    public int InvestmentProductId { get; set; }

    [Column("account_id")]
    public int AccountId { get; set; }

    [Column("allocated_amount", TypeName = "decimal(15,2)")]
    public decimal AllocatedAmount { get; set; }

    [Column("product_name_snapshot")]
    [StringLength(120)]
    public string ProductNameSnapshot { get; set; } = string.Empty;

    [Column("institution_snapshot")]
    [StringLength(120)]
    public string InstitutionSnapshot { get; set; } = string.Empty;

    [Column("offer_source_url_snapshot")]
    [StringLength(500)]
    public string OfferSourceUrlSnapshot { get; set; } = string.Empty;

    [Column("offer_source_label_snapshot")]
    [StringLength(120)]
    public string OfferSourceLabelSnapshot { get; set; } = string.Empty;

    [Column("offer_captured_for_month_snapshot", TypeName = "char(7)")]
    [StringLength(7)]
    public string OfferCapturedForMonthSnapshot { get; set; } = string.Empty;

    [Column("offer_valid_from_snapshot")]
    public DateOnly OfferValidFromSnapshot { get; set; }

    [Column("offer_valid_to_snapshot")]
    public DateOnly OfferValidToSnapshot { get; set; }

    [Column("offer_validity_inferred_snapshot")]
    public bool OfferValidityInferredSnapshot { get; set; }

    [Column("terms_snapshot", TypeName = "text")]
    public string? TermsSnapshot { get; set; }

    [Column("conditions_confirmed_snapshot")]
    public bool ConditionsConfirmedSnapshot { get; set; }

    [Column("tier_snapshot_json", TypeName = "text")]
    public string TierSnapshotJson { get; set; } = "[]";

    public InvestmentPlan Plan { get; set; } = null!;
}
