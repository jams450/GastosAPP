using System.Globalization;
using System.Text.Json;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Investments;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services.Investments;

/// <summary>
/// Fixed-income catalog and monthly plan generation.
///
/// Boundaries kept deliberately narrow: this service only reads linked-account balances, never
/// creates transactions, and never writes credit/MSI rows. Rates and conditions are always literal
/// user input; the service never infers or fabricates a rate. Persisted rows are snapshots, so
/// editing a catalog offer later does not rewrite an already generated plan.
/// </summary>
public class InvestmentService : IInvestmentService
{
    public const int MinProjectionMonths = 1;
    public const int MaxProjectionMonths = 24;

    private const int MaxConditionTextLength = 1000;

    public static readonly IReadOnlyList<string> AllowedInstitutionCodes = InvestmentInstitutions.AllowedCodes;

    private readonly IRepository _repository;

    public InvestmentService(IRepository repository) => _repository = repository;

    // ---------------------------------------------------------------------------------------
    // Catalog
    // ---------------------------------------------------------------------------------------

    public async Task<IReadOnlyList<InvestmentProductResult>> ListProductsAsync(int userId)
        => (await Products(userId).OrderBy(x => x.Name).ToListAsync()).Select(MapProduct).ToList();

    public async Task<InvestmentProductResult?> GetProductAsync(int id, int userId)
    {
        var product = await Products(userId).FirstOrDefaultAsync(x => x.InvestmentProductId == id);
        return product is null ? null : MapProduct(product);
    }

    public async Task<InvestmentProductResult> CreateProductAsync(int userId, InvestmentProductInput input)
    {
        ValidateInput(input);
        await ValidateAccountAsync(userId, input.AccountId, null, input.Active);

        var product = new InvestmentProduct
        {
            UserId = userId,
            AccountId = input.AccountId,
            Name = Text(input.Name, 120, "Product name"),
            Institution = InvestmentInstitutions.Normalize(input.Institution),
            Active = input.Active
        };

        await _repository.ExecuteInTransactionAsync(async () =>
        {
            await _repository.Save(product);
            await ReplaceOffersAsync(product, input.Offers);
            return 0;
        });

        return (await GetProductAsync(product.InvestmentProductId, userId))!;
    }

    public async Task<InvestmentProductResult?> UpdateProductAsync(int id, int userId, InvestmentProductInput input)
    {
        ValidateInput(input);
        var product = await _repository.GetTrack<InvestmentProduct>().FirstOrDefaultAsync(x => x.InvestmentProductId == id && x.UserId == userId);
        if (product is null) return null;

        await ValidateAccountAsync(userId, input.AccountId, id, input.Active);
        product.AccountId = input.AccountId;

        product.Name = Text(input.Name, 120, "Product name");
        product.Institution = InvestmentInstitutions.Normalize(input.Institution);
        product.Active = input.Active;

        var existingOffers = await _repository.Get<InvestmentOffer>()
            .Include(x => x.Tiers).Where(x => x.InvestmentProductId == id).ToListAsync();
        var offersUnchanged = OffersUnchanged(existingOffers, input.Offers);
        await _repository.ExecuteInTransactionAsync(async () =>
        {
            await _repository.SaveChangesAsync();
            if (!offersUnchanged) await ReplaceOffersAsync(product, input.Offers);
            return 0;
        });

        return await GetProductAsync(id, userId);
    }

    // Link-only edits never replace offers/tiers or change historical allocation snapshots.
    public async Task<bool> SetProductAccountAsync(int id, int userId, int? accountId)
    {
        var product = await _repository.GetTrack<InvestmentProduct>()
            .FirstOrDefaultAsync(x => x.InvestmentProductId == id && x.UserId == userId);
        if (product is null) return false;
        await ValidateAccountAsync(userId, accountId, id, product.Active);
        product.AccountId = accountId;
        await _repository.SaveChangesAsync();
        return true;
    }

    public async Task<bool> SetProductActiveAsync(int id, int userId, bool active)
    {
        var product = await _repository.GetTrack<InvestmentProduct>().FirstOrDefaultAsync(x => x.InvestmentProductId == id && x.UserId == userId);
        if (product is null) return false;

        // Reactivation revalidates the account: the account may have been deactivated or turned into credit.
        if (active)
            await ValidateAccountAsync(userId, product.AccountId, product.InvestmentProductId);

        product.Active = active;
        await _repository.SaveChangesAsync();
        return true;
    }

    // ---------------------------------------------------------------------------------------
    // Plans
    // ---------------------------------------------------------------------------------------

    /// <summary>
    /// Returns the persisted plan for the month, or a derived draft when the month has no plan yet.
    /// A draft is never written to the database. It classifies the whole catalog with the same rules
    /// generation uses — the same machine-readable reasons, and every product reported either as an
    /// allocation or as an exclusion — with one deliberate difference: a tier that declares special
    /// condition text is surfaced as a pending condition instead of excluding the product, because a
    /// draft has no confirmations to attest. The most recent previous plan only supplies provenance
    /// (<c>carriedFromPlanId</c>, <c>carriedFromPlanMonth</c>) and the projection horizon. It returns
    /// null (404) only when the user has no prior plan and no products at all.
    /// </summary>
    public async Task<InvestmentPlanResult?> GetCurrentPlanAsync(int userId, string? planMonth)
    {
        var month = InvestmentMonthResolver.Normalize(planMonth ?? InvestmentMonthResolver.CurrentMonthKey());

        var persistedId = await _repository.Get<InvestmentPlan>()
            .Where(x => x.UserId == userId && x.PlanMonth == month)
            .Select(x => x.InvestmentPlanId)
            .FirstOrDefaultAsync();

        if (persistedId != 0)
            return await GetPlanAsync(persistedId, userId);

        var previousCandidates = await _repository.Get<InvestmentPlan>()
            .Where(x => x.UserId == userId && x.PlanMonth != month)
            .Select(x => new { x.InvestmentPlanId, x.PlanMonth, x.ProjectionMonths })
            .ToListAsync();

        // plan_month is char(7) yyyy-MM, so ordinal comparison is the calendar order.
        var previous = previousCandidates
            .Where(c => string.CompareOrdinal(c.PlanMonth, month) < 0)
            .OrderByDescending(c => c.PlanMonth, StringComparer.Ordinal)
            .FirstOrDefault();

        var products = await Products(userId).ToListAsync();
        if (previous is null && products.Count == 0) return null;

        return await BuildDraftAsync(userId, month, previous?.InvestmentPlanId, previous?.PlanMonth, previous?.ProjectionMonths ?? 12, products);
    }

    public async Task<InvestmentPlanResult?> GetPlanAsync(int id, int userId)
    {
        var plan = await _repository.Get<InvestmentPlan>()
            .Include(x => x.Allocations)
            .FirstOrDefaultAsync(x => x.InvestmentPlanId == id && x.UserId == userId);

        return plan is null ? null : MapPersistedPlan(plan);
    }

    /// <summary>
    /// Projection view of a persisted plan: the monthly series per allocation plus the exclusions
    /// recorded at generation time. Kept separate from the plan detail contract on purpose.
    /// </summary>
    public async Task<InvestmentPlanProjectionResult?> GetPlanProjectionAsync(int id, int userId)
    {
        var plan = await _repository.Get<InvestmentPlan>()
            .Include(x => x.Allocations)
            .FirstOrDefaultAsync(x => x.InvestmentPlanId == id && x.UserId == userId);

        if (plan is null) return null;

        return new InvestmentPlanProjectionResult
        {
            InvestmentPlanId = plan.InvestmentPlanId,
            PlanMonth = plan.PlanMonth,
            ProjectionMonths = plan.ProjectionMonths,
            IsPersisted = true,
            Allocations = plan.Allocations
                .OrderBy(a => a.ProductNameSnapshot)
                .Select(a => ToProjectionAllocation(a, plan))
                .ToList(),
            Exclusions = DeserializeExclusions(plan.ExclusionsJson)
        };
    }

    public async Task<InvestmentPlanResult> GeneratePlanAsync(int userId, InvestmentPlanGenerateInput input)
    {
        if (input is null) throw new ArgumentException("A plan generation request is required.");

        var month = InvestmentMonthResolver.Normalize(input.PlanMonth);
        if (input.ProjectionMonths is < MinProjectionMonths or > MaxProjectionMonths)
            throw new ArgumentException($"projectionMonths must be between {MinProjectionMonths} and {MaxProjectionMonths}.");

        var start = InvestmentMonthResolver.StartDate(month);
        var confirmedTierIds = (input.ConfirmedTierIds ?? []).ToHashSet();

        var products = await Products(userId).ToListAsync();

        var eligible = new List<(InvestmentProduct Product, InvestmentOffer Offer)>();
        var exclusions = new List<InvestmentExclusionResult>();

        foreach (var product in products)
        {
            var (offer, reason) = Classify(product, month, start, confirmedTierIds);
            if (offer is not null)
            {
                eligible.Add((product, offer));
                continue;
            }

            exclusions.Add(ToExclusion(product, reason!));
        }

        // Only a fully ineligible catalog is a request-level failure; anything else generates a plan
        // for the eligible products and reports every exclusion explicitly.
        if (eligible.Count == 0)
        {
            var detail = exclusions.Count == 0
                ? "No active investment products exist."
                : $"No investment product is eligible for {month}: {string.Join("; ", exclusions.Select(e => $"{e.ProductName} ({e.Reason})"))}.";
            throw new ArgumentException(detail);
        }

        return await _repository.ExecuteInTransactionAsync(async () =>
        {
            var plan = await _repository.GetTrack<InvestmentPlan>()
                .Include(x => x.Allocations)
                .FirstOrDefaultAsync(x => x.UserId == userId && x.PlanMonth == month);

            if (plan is null)
            {
                plan = new InvestmentPlan { UserId = userId, PlanMonth = month, ProjectionMonths = input.ProjectionMonths, ExclusionsJson = "[]" };
                await _repository.Save(plan);
            }
            else
            {
                _repository.GetTrack<InvestmentPlanAllocation>().RemoveRange(plan.Allocations);
                plan.ProjectionMonths = input.ProjectionMonths;
                await _repository.SaveChangesAsync();
            }

            plan.ExclusionsJson = JsonSerializer.Serialize(exclusions);

            foreach (var (product, offer) in eligible)
            {
                var tiers = offer.Tiers.OrderBy(t => t.MinimumAmount).ToList();
                var snapshot = tiers.Select(t => new InvestmentTierSnapshot
                {
                    InvestmentRateTierId = t.InvestmentRateTierId,
                    MinimumAmount = t.MinimumAmount,
                    MaximumAmount = t.MaximumAmount,
                    AnnualRatePercent = t.AnnualRatePercent,
                    SpecialConditionText = t.SpecialConditionText,
                    ConditionConfirmed = true // eligible means every declaration was explicitly confirmed
                }).ToList();

                await _repository.Save(new InvestmentPlanAllocation
                {
                    InvestmentPlanId = plan.InvestmentPlanId,
                    InvestmentProductId = product.InvestmentProductId,
                    AccountId = product.AccountId!.Value,
                    AllocatedAmount = product.Account!.CurrentBalance,
                    ProductNameSnapshot = product.Name,
                    InstitutionSnapshot = product.Institution,
                    OfferSourceUrlSnapshot = offer.SourceUrl,
                    OfferSourceLabelSnapshot = offer.SourceLabel,
                    OfferCapturedForMonthSnapshot = offer.CapturedForMonth,
                    OfferValidFromSnapshot = offer.ValidFrom,
                    OfferValidToSnapshot = offer.ValidTo,
                    OfferValidityInferredSnapshot = offer.ValidityInferred,
                    TermsSnapshot = offer.TermsText,
                    ConditionsConfirmedSnapshot = offer.ConditionsConfirmed,
                    TierSnapshotJson = JsonSerializer.Serialize(snapshot)
                });
            }

            await _repository.SaveChangesAsync();
            return (await GetPlanAsync(plan.InvestmentPlanId, userId))!;
        });
    }

    /// <summary>
    /// Eligibility check for one product. Returns the usable offer, or the machine-readable reason
    /// the product was excluded. No rate is ever inferred here.
    ///
    /// <paramref name="deferTierConditionConfirmation"/> exists for the derived draft only: a draft has
    /// no confirmations to attest, yet it must still surface every declaration as a pending condition
    /// instead of excluding the product, so the reader can confirm it. Generation always passes
    /// <c>false</c>, which keeps the per-tier attestation authoritative for persisted plans.
    /// </summary>
    private static (InvestmentOffer? Offer, string? Reason) Classify(
        InvestmentProduct product,
        string month,
        DateOnly monthStart,
        HashSet<int> confirmedTierIds,
        bool deferTierConditionConfirmation = false)
    {
        if (!InvestmentInstitutions.IsAllowed(product.Institution))
            return (null, InvestmentExclusionReasons.UnsupportedInstitution);

        if (!product.Active)
            return (null, InvestmentExclusionReasons.InactiveProduct);

        if (product.AccountId is null)
            return (null, InvestmentExclusionReasons.UnlinkedAccount);
        if (product.Account is null)
            return (null, InvestmentExclusionReasons.MissingAccount);
        if (product.Account.UserId != product.UserId)
            return (null, InvestmentExclusionReasons.ForeignAccount);
        if (!product.Account.Active)
            return (null, InvestmentExclusionReasons.InactiveAccount);
        if (product.Account.IsCredit)
            return (null, InvestmentExclusionReasons.CreditAccount);
        if (!product.Account.EarnsInterest)
            return (null, InvestmentExclusionReasons.NonInterestAccount);

        if (product.Offers.Count == 0)
            return (null, InvestmentExclusionReasons.NoOfferForMonth);

        // The offer must have been captured for the plan month; a capture from an earlier month is
        // stale and cannot be promoted to the current month.
        var offer = product.Offers.SingleOrDefault(o => string.Equals(o.CapturedForMonth, month, StringComparison.Ordinal));
        if (offer is null)
            return (null, InvestmentExclusionReasons.OfferNotCapturedForMonth);

        if (offer.ValidFrom > monthStart || offer.ValidTo < monthStart)
            return (null, InvestmentExclusionReasons.ValidityNotCoveringMonth);

        if (!offer.ConditionsConfirmed)
            return (null, InvestmentExclusionReasons.ConditionsNotConfirmed);

        var tiers = offer.Tiers.ToList();
        if (tiers.Count == 0)
            return (null, InvestmentExclusionReasons.InvalidOrMissingTiers);

        try
        {
            InvestmentCalculator.ValidateTierSchedule(tiers);
        }
        catch (ArgumentException)
        {
            return (null, InvestmentExclusionReasons.InvalidOrMissingTiers);
        }

        // A tier that declares special condition text is only usable when the caller explicitly
        // confirmed that exact tier for this generation. A draft defers this single check, because the
        // draft is the surface that collects those confirmations; it never assumes one.
        if (!deferTierConditionConfirmation)
        {
            var unconfirmed = tiers.Where(t => HasCondition(t) && !confirmedTierIds.Contains(t.InvestmentRateTierId)).ToList();
            if (unconfirmed.Count > 0)
                return (null, InvestmentExclusionReasons.ConditionsNotConfirmed);
        }

        return (offer, null);
    }

    private static string ExclusionMessage(string reason) => reason switch
    {
        InvestmentExclusionReasons.UnlinkedAccount => "El producto no tiene una cuenta vinculada.",
        InvestmentExclusionReasons.MissingAccount => "La cuenta vinculada no existe o no está disponible.",
        InvestmentExclusionReasons.ForeignAccount => "La cuenta vinculada no pertenece al usuario del producto.",
        InvestmentExclusionReasons.InactiveAccount => "La cuenta vinculada está inactiva.",
        InvestmentExclusionReasons.CreditAccount => "La cuenta vinculada es de crédito.",
        InvestmentExclusionReasons.NonInterestAccount => "La cuenta vinculada no genera intereses.",
        InvestmentExclusionReasons.InactiveProduct => "The product is inactive.",
        InvestmentExclusionReasons.UnsupportedInstitution => $"The institution is not in the V1 catalog ({string.Join(", ", InvestmentInstitutions.AllowedCodes)}).",
        InvestmentExclusionReasons.NoOfferForMonth => "The product has no offers.",
        InvestmentExclusionReasons.OfferNotCapturedForMonth => "No offer was captured for the plan month.",
        InvestmentExclusionReasons.ValidityNotCoveringMonth => "The offer validity does not cover the plan month.",
        InvestmentExclusionReasons.ConditionsNotConfirmed => "The offer conditions are not confirmed.",
        InvestmentExclusionReasons.InvalidOrMissingTiers => "The marginal tier schedule is missing or invalid.",
        _ => "The product was excluded."
    };

    // ---------------------------------------------------------------------------------------
    // Draft derivation (never persisted)
    // ---------------------------------------------------------------------------------------

    private Task<InvestmentPlanResult> BuildDraftAsync(
        int userId,
        string month,
        int? carriedFromPlanId,
        string? carriedFromPlanMonth,
        int projectionMonths,
        List<InvestmentProduct> products)
    {
        var monthStart = InvestmentMonthResolver.StartDate(month);

        // The draft partitions the whole catalog exactly like generation does: the same eligibility
        // rules, the same machine-readable reasons, and full coverage — every product ends up either as
        // an allocation or as an exclusion, never in neither list. The only deliberate difference is a
        // tier that declares special condition text: the draft surfaces it as a pending condition
        // (never as an assumed confirmation) instead of excluding the product, because collecting that
        // attestation is what the draft is for. A carried product whose offer is stale or otherwise
        // ineligible for the target month is therefore reported as an exclusion with its real reason.
        var allocations = new List<InvestmentAllocationResult>();
        var exclusions = new List<InvestmentExclusionResult>();

        foreach (var product in products.OrderBy(p => p.Name))
        {
            var (offer, reason) = Classify(product, month, monthStart, [], deferTierConditionConfirmation: true);
            if (offer is null)
            {
                exclusions.Add(ToExclusion(product, reason ?? InvestmentExclusionReasons.NoOfferForMonth));
                continue;
            }

            var tiers = offer.Tiers.OrderBy(t => t.MinimumAmount).ToList();
            var pending = tiers
                .Where(HasCondition)
                .Select(t => new InvestmentPendingConditionResult
                {
                    InvestmentProductId = product.InvestmentProductId,
                    InvestmentOfferId = offer.InvestmentOfferId,
                    InvestmentRateTierId = t.InvestmentRateTierId,
                    SpecialConditionText = t.SpecialConditionText!.Trim()
                })
                .ToList();

            allocations.Add(new InvestmentAllocationResult
            {
                InvestmentProductId = product.InvestmentProductId,
                AccountId = product.AccountId!.Value,
                ProductName = product.Name,
                Institution = product.Institution,
                InstitutionLabel = InvestmentInstitutions.Label(product.Institution),
                AllocatedAmount = product.Account!.CurrentBalance,
                OfferCapturedForMonth = offer.CapturedForMonth,
                OfferValidFrom = offer.ValidFrom,
                OfferValidTo = offer.ValidTo,
                ValidityInferred = offer.ValidityInferred,
                OfferSourceUrl = offer.SourceUrl,
                OfferSourceLabel = offer.SourceLabel,
                TermsText = offer.TermsText,
                ConditionsConfirmed = offer.ConditionsConfirmed,
                // Every offer reaching this point is captured for the target month with validity that
                // covers it; the states a reader used to read here are now exclusion reasons instead.
                OfferFreshness = InvestmentOfferFreshness.Current,
                PendingConditions = pending,
                Tiers = tiers.Select(t => new InvestmentAllocationTierResult
                {
                    InvestmentRateTierId = t.InvestmentRateTierId,
                    MinimumAmount = t.MinimumAmount,
                    MaximumAmount = t.MaximumAmount,
                    AnnualRatePercent = t.AnnualRatePercent,
                    SpecialConditionText = Trimmed(t.SpecialConditionText),
                    ConditionConfirmed = false // a draft carries no confirmations; they must be reasserted
                }).ToList()
            });
        }

        return Task.FromResult(new InvestmentPlanResult
        {
            InvestmentPlanId = 0,
            PlanMonth = month,
            ProjectionMonths = projectionMonths,
            IsPersisted = false,
            CarriedFromPlanId = carriedFromPlanId,
            CarriedFromPlanMonth = carriedFromPlanMonth,
            Allocations = allocations,
            Exclusions = exclusions
        });
    }

    private static InvestmentExclusionResult ToExclusion(InvestmentProduct product, string reason) => new()
    {
        InvestmentProductId = product.InvestmentProductId,
        ProductName = product.Name,
        Institution = product.Institution,
        InstitutionLabel = InvestmentInstitutions.Label(product.Institution),
        Reason = reason,
        Message = ExclusionMessage(reason)
    };

    // ---------------------------------------------------------------------------------------
    // Mapping
    // ---------------------------------------------------------------------------------------

    private static InvestmentPlanResult MapPersistedPlan(InvestmentPlan plan) => new()
    {
        InvestmentPlanId = plan.InvestmentPlanId,
        PlanMonth = plan.PlanMonth,
        ProjectionMonths = plan.ProjectionMonths,
        IsPersisted = true,
        Allocations = plan.Allocations
            .OrderBy(a => a.ProductNameSnapshot)
            .Select(a => (InvestmentAllocationResult)MapAllocation(a))
            .ToList(),
        Exclusions = DeserializeExclusions(plan.ExclusionsJson)
    };

    private static InvestmentAllocationProjectionResult ToProjectionAllocation(InvestmentPlanAllocation allocation, InvestmentPlan plan)
    {
        var tiers = DeserializeTierSnapshot(allocation.TierSnapshotJson);
        var result = new InvestmentAllocationProjectionResult
        {
            InvestmentProductId = allocation.InvestmentProductId,
            AccountId = allocation.AccountId,
            ProductName = allocation.ProductNameSnapshot,
            Institution = allocation.InstitutionSnapshot,
            InstitutionLabel = InvestmentInstitutions.Label(allocation.InstitutionSnapshot),
            AllocatedAmount = allocation.AllocatedAmount,
            OfferCapturedForMonth = allocation.OfferCapturedForMonthSnapshot,
            OfferValidFrom = allocation.OfferValidFromSnapshot,
            OfferValidTo = allocation.OfferValidToSnapshot,
            ValidityInferred = allocation.OfferValidityInferredSnapshot,
            OfferSourceUrl = allocation.OfferSourceUrlSnapshot,
            OfferSourceLabel = allocation.OfferSourceLabelSnapshot,
            TermsText = allocation.TermsSnapshot,
            ConditionsConfirmed = allocation.ConditionsConfirmedSnapshot,
            Tiers = tiers.Select(MapAllocationTier).ToList()
        };

        if (tiers.Count > 0)
            result.Projection.AddRange(InvestmentCalculator.Project(
                plan.PlanMonth,
                allocation.AllocatedAmount,
                tiers.Select(MarginalRateTier.From).ToList(),
                plan.ProjectionMonths));

        return result;
    }

    private static InvestmentAllocationResult MapAllocation(InvestmentPlanAllocation allocation) => new()
    {
        InvestmentProductId = allocation.InvestmentProductId,
        AccountId = allocation.AccountId,
        ProductName = allocation.ProductNameSnapshot,
        Institution = allocation.InstitutionSnapshot,
        InstitutionLabel = InvestmentInstitutions.Label(allocation.InstitutionSnapshot),
        AllocatedAmount = allocation.AllocatedAmount,
        OfferCapturedForMonth = allocation.OfferCapturedForMonthSnapshot,
        OfferValidFrom = allocation.OfferValidFromSnapshot,
        OfferValidTo = allocation.OfferValidToSnapshot,
        ValidityInferred = allocation.OfferValidityInferredSnapshot,
        OfferSourceUrl = allocation.OfferSourceUrlSnapshot,
        OfferSourceLabel = allocation.OfferSourceLabelSnapshot,
        TermsText = allocation.TermsSnapshot,
        ConditionsConfirmed = allocation.ConditionsConfirmedSnapshot,
        Tiers = DeserializeTierSnapshot(allocation.TierSnapshotJson).Select(MapAllocationTier).ToList()
    };

    private static InvestmentAllocationTierResult MapAllocationTier(InvestmentTierSnapshot tier) => new()
    {
        InvestmentRateTierId = tier.InvestmentRateTierId,
        MinimumAmount = tier.MinimumAmount,
        MaximumAmount = tier.MaximumAmount,
        AnnualRatePercent = tier.AnnualRatePercent,
        SpecialConditionText = Trimmed(tier.SpecialConditionText),
        ConditionConfirmed = tier.ConditionConfirmed
    };

    private static List<InvestmentTierSnapshot> DeserializeTierSnapshot(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return JsonSerializer.Deserialize<List<InvestmentTierSnapshot>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static List<InvestmentExclusionResult> DeserializeExclusions(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return JsonSerializer.Deserialize<List<InvestmentExclusionResult>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static InvestmentProductResult MapProduct(InvestmentProduct product) => new()
    {
        InvestmentProductId = product.InvestmentProductId,
        AccountId = product.AccountId,
        AccountName = product.Account?.UserId == product.UserId ? product.Account.Name : null,
        Name = product.Name,
        Institution = product.Institution,
        InstitutionLabel = InvestmentInstitutions.Label(product.Institution),
        Active = product.Active,
        Offers = product.Offers
            .OrderByDescending(o => o.CapturedForMonth)
            .ThenByDescending(o => o.InvestmentOfferId)
            .Select(o => new InvestmentOfferResult
            {
                InvestmentOfferId = o.InvestmentOfferId,
                CapturedForMonth = o.CapturedForMonth,
                ValidFrom = o.ValidFrom,
                ValidTo = o.ValidTo,
                ValidityInferred = o.ValidityInferred,
                SourceUrl = o.SourceUrl,
                SourceLabel = o.SourceLabel,
                TermsText = o.TermsText,
                ConditionsConfirmed = o.ConditionsConfirmed,
                Tiers = o.Tiers
                    .OrderBy(t => t.MinimumAmount)
                    .Select(t => new InvestmentTierResult
                    {
                        InvestmentRateTierId = t.InvestmentRateTierId,
                        MinimumAmount = t.MinimumAmount,
                        MaximumAmount = t.MaximumAmount,
                        AnnualRatePercent = t.AnnualRatePercent,
                        SpecialConditionText = Trimmed(t.SpecialConditionText)
                    })
                    .ToList()
            })
            .ToList()
    };

    // ---------------------------------------------------------------------------------------
    // Persistence helpers
    // ---------------------------------------------------------------------------------------

    private IQueryable<InvestmentProduct> Products(int userId) => _repository
        .Get<InvestmentProduct>(x => x.UserId == userId)
        .Include(x => x.Account)
        .Include(x => x.Offers)
        .ThenInclude(x => x.Tiers);

    // A full form may submit only a link or catalog metadata change. Preserve stable tier identities
    // when the normalized offer content is identical, so existing confirmations remain meaningful.
    private static bool OffersUnchanged(IReadOnlyList<InvestmentOffer> existing, IReadOnlyList<InvestmentOfferInput> inputs)
    {
        if (existing.Count != inputs.Count) return false;
        foreach (var input in inputs)
        {
            var month = InvestmentMonthResolver.Normalize(input.CapturedForMonth);
            var offer = existing.SingleOrDefault(x => x.CapturedForMonth == month);
            if (offer is null || offer.ValidFrom != input.ValidFrom ||
                offer.ValidTo != (input.ValidTo ?? InvestmentMonthResolver.EndOfCaptureYear(month)) ||
                offer.ValidityInferred != (input.ValidTo is null) || offer.SourceUrl != Url(input.SourceUrl) ||
                offer.SourceLabel != Text(input.SourceLabel, 120, "Source label") ||
                offer.TermsText != OptionalText(input.TermsText) || offer.ConditionsConfirmed != input.ConditionsConfirmed ||
                offer.Tiers.Count != input.Tiers.Count) return false;
            var tiers = offer.Tiers.OrderBy(x => x.MinimumAmount).ToList();
            var requested = input.Tiers.OrderBy(x => x.MinimumAmount).ToList();
            for (var i = 0; i < tiers.Count; i++)
                if (tiers[i].MinimumAmount != requested[i].MinimumAmount || tiers[i].MaximumAmount != requested[i].MaximumAmount ||
                    tiers[i].AnnualRatePercent != requested[i].AnnualRatePercent ||
                    tiers[i].SpecialConditionText != OptionalText(requested[i].SpecialConditionText)) return false;
        }
        return true;
    }

    private async Task ReplaceOffersAsync(InvestmentProduct product, IReadOnlyList<InvestmentOfferInput> inputs)
    {
        var offers = _repository.GetTrack<InvestmentOffer>();
        var existing = await offers.Include(x => x.Tiers).Where(x => x.InvestmentProductId == product.InvestmentProductId).ToListAsync();
        offers.RemoveRange(existing);

        foreach (var input in inputs)
        {
            var capturedForMonth = InvestmentMonthResolver.Normalize(input.CapturedForMonth);
            var validFrom = input.ValidFrom;
            // Inferred validity: no declared end means December 31 of the capture year, flagged as inferred.
            var (validTo, inferred) = input.ValidTo is { } declared
                ? (declared, false)
                : (InvestmentMonthResolver.EndOfCaptureYear(capturedForMonth), true);

            var offer = new InvestmentOffer
            {
                InvestmentProductId = product.InvestmentProductId,
                CapturedForMonth = capturedForMonth,
                ValidFrom = validFrom,
                ValidTo = validTo,
                ValidityInferred = inferred,
                SourceUrl = Url(input.SourceUrl),
                SourceLabel = Text(input.SourceLabel, 120, "Source label"),
                TermsText = OptionalText(input.TermsText),
                ConditionsConfirmed = input.ConditionsConfirmed,
                Tiers = input.Tiers.Select(t => new InvestmentRateTier
                {
                    MinimumAmount = t.MinimumAmount,
                    MaximumAmount = t.MaximumAmount,
                    AnnualRatePercent = t.AnnualRatePercent,
                    SpecialConditionText = OptionalText(t.SpecialConditionText)
                }).ToList()
            };

            await _repository.Save(offer);
        }
    }

    private async Task ValidateAccountAsync(int userId, int? accountId, int? productId, bool active = true)
    {
        if (accountId is null) return;
        if (accountId <= 0) throw new ArgumentException("Account not found or not accessible.");
        var account = await _repository.Get<Account>(a => a.AccountId == accountId && a.UserId == userId).FirstOrDefaultAsync()
            ?? throw new ArgumentException("Account not found or not accessible.");
        if (!account.Active || account.IsCredit || !account.EarnsInterest)
            throw new ArgumentException("Investment products require an active non-credit interest-bearing account.");

        // One active product per account, and one active account per product.
        if (active && await _repository.Get<InvestmentProduct>(p => p.UserId == userId && p.AccountId == accountId && p.Active && p.InvestmentProductId != productId).AnyAsync())
            throw new ArgumentException("An active investment product already links this account.");
    }

    // ---------------------------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------------------------

    private static void ValidateInput(InvestmentProductInput input)
    {
        if (input is null || input.Offers is null || input.Offers.Count == 0)
            throw new ArgumentException("Product requires at least one offer.");

        Text(input.Name, 120, "Product name");
        InvestmentInstitutions.Normalize(input.Institution);

        var capturedMonths = new HashSet<string>(StringComparer.Ordinal);
        foreach (var offer in input.Offers)
        {
            var capturedForMonth = InvestmentMonthResolver.Normalize(offer.CapturedForMonth);
            if (!capturedMonths.Add(capturedForMonth))
                throw new ArgumentException("Each offer must use a different captured month.");

            // ValidTo is optional: the service infers December 31 of the capture year when absent.
            var validTo = offer.ValidTo ?? InvestmentMonthResolver.EndOfCaptureYear(capturedForMonth);
            if (validTo < offer.ValidFrom)
                throw new ArgumentException("Offer validity is required.");

            Text(offer.SourceLabel, 120, "Source label");
            Url(offer.SourceUrl);
            OptionalText(offer.TermsText);

            InvestmentCalculator.ValidateTierSchedule(offer.Tiers.Select(MarginalRateTier.From).ToList());

            foreach (var tier in offer.Tiers) OptionalText(tier.SpecialConditionText);
        }
    }

    /// <summary>Normalizes and bounds an optional literal text field. Null/blank becomes null.</summary>
    private static string? OptionalText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        if (trimmed.Length > MaxConditionTextLength)
            throw new ArgumentException($"Condition text cannot exceed {MaxConditionTextLength} characters.");
        return trimmed;
    }

    private static string Trimmed(string? value) => string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();

    private static bool HasCondition(InvestmentRateTier tier) => !string.IsNullOrWhiteSpace(tier.SpecialConditionText);

    private static string Text(string value, int max, string name)
    {
        value = value?.Trim() ?? "";
        if (value.Length == 0 || value.Length > max)
            throw new ArgumentException($"{name} is required and cannot exceed {max} characters.");
        return value;
    }

    private static string Url(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps || value.Length > 500)
            throw new ArgumentException("sourceUrl must be an HTTPS URL.");
        return uri.ToString();
    }
}
