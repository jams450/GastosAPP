using GastosApp.BusinessLogic.Models.Investments;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Services.Investments;

/// <summary>
/// Minimal, immutable view of one marginal rate tier. Both the persisted entity and the plan
/// snapshot serialize into this shape, so the math has a single input type and stays testable
/// without EF. Imports are type-only, so this module has no runtime dependency.
/// </summary>
public sealed record MarginalRateTier(decimal MinimumAmount, decimal? MaximumAmount, decimal AnnualRatePercent)
{
    public static MarginalRateTier From(InvestmentRateTier tier) => new(tier.MinimumAmount, tier.MaximumAmount, tier.AnnualRatePercent);

    public static MarginalRateTier From(InvestmentTierSnapshot snapshot) => new(snapshot.MinimumAmount, snapshot.MaximumAmount, snapshot.AnnualRatePercent);

    public static MarginalRateTier From(InvestmentTierInput input) => new(input.MinimumAmount, input.MaximumAmount, input.AnnualRatePercent);
}

/// <summary>
/// Pure marginal-tier math. Tiers are always marginal: each rate only applies to the portion of the
/// balance that falls inside its own interval, never to the whole balance. No rate is ever inferred.
/// </summary>
public static class InvestmentCalculator
{
    public static void ValidateTierSchedule(IReadOnlyList<InvestmentRateTier> tiers)
        => ValidateTierSchedule(tiers.Select(MarginalRateTier.From).ToList());

    public static void ValidateTierSchedule(IReadOnlyList<MarginalRateTier> tiers)
    {
        if (tiers.Count == 0)
            throw new ArgumentException("A marginal rate schedule requires at least one tier.");

        var ordered = tiers.OrderBy(t => t.MinimumAmount).ToList();
        if (ordered[0].MinimumAmount != 0m)
            throw new ArgumentException("The first marginal rate tier must start at 0.");

        for (var index = 0; index < ordered.Count; index++)
        {
            var tier = ordered[index];
            if (tier.AnnualRatePercent < 0m)
                throw new ArgumentException("Marginal rate tiers cannot have a negative annual rate.");

            if (tier.MaximumAmount is null)
            {
                if (index != ordered.Count - 1)
                    throw new ArgumentException("The unbounded marginal rate tier must be the final tier.");

                continue;
            }

            if (tier.MaximumAmount <= tier.MinimumAmount)
                throw new ArgumentException("Each bounded marginal rate tier must have a maximum greater than its minimum.");

            if (index == ordered.Count - 1)
                throw new ArgumentException("A marginal rate schedule must end with exactly one unbounded tier.");

            if (ordered[index + 1].MinimumAmount != tier.MaximumAmount)
                throw new ArgumentException("Marginal rate tiers must be contiguous without gaps or overlaps.");
        }
    }

    public static decimal CalculateMonthlyInterest(decimal principal, IReadOnlyList<MarginalRateTier> tiers)
    {
        ValidateTierSchedule(tiers);
        if (principal <= 0m) return 0m;

        decimal interest = 0m;
        foreach (var tier in tiers.OrderBy(t => t.MinimumAmount))
        {
            var tierUpper = tier.MaximumAmount ?? principal;
            var amountInTier = Math.Max(0m, Math.Min(principal, tierUpper) - tier.MinimumAmount);
            interest += amountInTier * (tier.AnnualRatePercent / 100m) / 12m;
        }

        return Math.Round(interest, 2, MidpointRounding.AwayFromZero);
    }

    public static List<InvestmentProjectionRow> Project(string planMonth, decimal initialBalance, IReadOnlyList<MarginalRateTier> tiers, int months)
    {
        var start = DateOnly.ParseExact(planMonth + "-01", "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        var balance = initialBalance;
        var rows = new List<InvestmentProjectionRow>(months);
        for (var index = 0; index < months; index++)
        {
            var interest = CalculateMonthlyInterest(balance, tiers);
            var closing = Math.Round(balance + interest, 2 , MidpointRounding.AwayFromZero);
            rows.Add(new InvestmentProjectionRow { MonthNumber = index + 1, Month = start.AddMonths(index).ToString("yyyy-MM"), OpeningBalance = balance, Interest = interest, ClosingBalance = closing });
            balance = closing;
        }

        return rows;
    }
}
