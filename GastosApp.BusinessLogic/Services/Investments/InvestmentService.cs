using System.Globalization;
using System.Text.Json;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Investments;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services.Investments;

public class InvestmentService : IInvestmentService
{
    private readonly IRepository _repository;
    public InvestmentService(IRepository repository) => _repository = repository;

    public async Task<IReadOnlyList<InvestmentProduct>> ListProductsAsync(int userId) => await Products(userId).OrderBy(x => x.Name).ToListAsync();
    public Task<InvestmentProduct?> GetProductAsync(int id, int userId) => Products(userId).FirstOrDefaultAsync(x => x.InvestmentProductId == id);

    public async Task<InvestmentProduct> CreateProductAsync(int userId, InvestmentProductInput input)
    {
        ValidateInput(input);
        await ValidateAccountAsync(userId, input.AccountId, null);
        var product = new InvestmentProduct { UserId = userId, AccountId = input.AccountId, Name = Text(input.Name, 120, "Product name"), Institution = Text(input.Institution, 120, "Institution"), Active = input.Active };
        await _repository.ExecuteInTransactionAsync(async () => { await _repository.Save(product); await ReplaceOffersAsync(product, input.Offers); return 0; });
        return (await GetProductAsync(product.InvestmentProductId, userId))!;
    }

    public async Task<InvestmentProduct?> UpdateProductAsync(int id, int userId, InvestmentProductInput input)
    {
        ValidateInput(input);
        var product = await _repository.GetTrack<InvestmentProduct>().FirstOrDefaultAsync(x => x.InvestmentProductId == id && x.UserId == userId);
        if (product is null) return null;
        if (product.AccountId != input.AccountId) throw new ArgumentException("accountId is read-only once a product is created.");
        await ValidateAccountAsync(userId, product.AccountId, id);
        product.Name = Text(input.Name, 120, "Product name"); product.Institution = Text(input.Institution, 120, "Institution"); product.Active = input.Active;
        await _repository.ExecuteInTransactionAsync(async () => { await _repository.SaveChangesAsync(); await ReplaceOffersAsync(product, input.Offers); return 0; });
        return await GetProductAsync(id, userId);
    }

    public async Task<bool> SetProductActiveAsync(int id, int userId, bool active)
    {
        var product = await _repository.GetTrack<InvestmentProduct>().FirstOrDefaultAsync(x => x.InvestmentProductId == id && x.UserId == userId);
        if (product is null) return false;

        if (active)
            await ValidateAccountAsync(userId, product.AccountId, product.InvestmentProductId);

        product.Active = active;
        await _repository.SaveChangesAsync();
        return true;
    }

    public async Task<InvestmentPlanResult> GeneratePlanAsync(int userId, string planMonth, int projectionMonths)
    {
        planMonth = Month(planMonth); if (projectionMonths is < 1 or > 120) throw new ArgumentException("projectionMonths must be between 1 and 120.");
        var date = DateOnly.ParseExact(planMonth + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var products = await Products(userId).Where(x => x.Active).ToListAsync();
        var eligible = new List<(InvestmentProduct Product, InvestmentOffer Offer)>();
        foreach (var product in products)
        {
            var offer = product.Offers.SingleOrDefault(o => o.CapturedForMonth == planMonth && o.ConditionsConfirmed && o.ValidFrom <= date && o.ValidTo >= date && o.Tiers.Count > 0);
            if (offer is not null)
            {
                InvestmentCalculator.ValidateTierSchedule(offer.Tiers.ToList());
                eligible.Add((product, offer));
            }
        }
        if (products.Count == 0) throw new ArgumentException("No active investment products exist.");
        if (eligible.Count != products.Count) throw new ArgumentException("Every active product needs a confirmed, valid offer with tiers captured for the plan month.");
        return await _repository.ExecuteInTransactionAsync(async () =>
        {
            var plan = await _repository.GetTrack<InvestmentPlan>().Include(x => x.Allocations).FirstOrDefaultAsync(x => x.UserId == userId && x.PlanMonth == planMonth);
            if (plan is null) { plan = new InvestmentPlan { UserId = userId, PlanMonth = planMonth, ProjectionMonths = projectionMonths }; await _repository.Save(plan); }
            else { _repository.GetTrack<InvestmentPlanAllocation>().RemoveRange(plan.Allocations); plan.ProjectionMonths = projectionMonths; await _repository.SaveChangesAsync(); }
            foreach (var (product, offer) in eligible)
            {
                await _repository.Save(new InvestmentPlanAllocation { InvestmentPlanId = plan.InvestmentPlanId, InvestmentProductId = product.InvestmentProductId, AccountId = product.AccountId, AllocatedAmount = product.Account.CurrentBalance, ProductNameSnapshot = product.Name, InstitutionSnapshot = product.Institution, OfferSourceUrlSnapshot = offer.SourceUrl, OfferSourceLabelSnapshot = offer.SourceLabel, OfferCapturedForMonthSnapshot = offer.CapturedForMonth, OfferValidFromSnapshot = offer.ValidFrom, OfferValidToSnapshot = offer.ValidTo, ConditionsConfirmedSnapshot = offer.ConditionsConfirmed, TierSnapshotJson = JsonSerializer.Serialize(offer.Tiers.Select(t => new { t.MinimumAmount, t.MaximumAmount, t.AnnualRatePercent })) });
            }
            return (await GetPlanAsync(plan.InvestmentPlanId, userId))!;
        });
    }

    public async Task<InvestmentPlanResult?> GetCurrentPlanAsync(int userId, string? planMonth) { var month = Month(planMonth ?? DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM")); var plan = await _repository.Get<InvestmentPlan>().Where(x => x.UserId == userId && x.PlanMonth == month).Select(x => x.InvestmentPlanId).FirstOrDefaultAsync(); return plan == 0 ? null : await GetPlanAsync(plan, userId); }
    public async Task<InvestmentPlanResult?> GetPlanAsync(int id, int userId)
    {
        var plan = await _repository.Get<InvestmentPlan>().Include(x => x.Allocations).FirstOrDefaultAsync(x => x.InvestmentPlanId == id && x.UserId == userId); if (plan is null) return null;
        return new InvestmentPlanResult { InvestmentPlanId = plan.InvestmentPlanId, PlanMonth = plan.PlanMonth, ProjectionMonths = plan.ProjectionMonths, Allocations = plan.Allocations.Select(a => new InvestmentAllocationResult { InvestmentProductId = a.InvestmentProductId, AccountId = a.AccountId, ProductName = a.ProductNameSnapshot, Institution = a.InstitutionSnapshot, AllocatedAmount = a.AllocatedAmount, Projection = InvestmentCalculator.Project(plan.PlanMonth, a.AllocatedAmount, JsonSerializer.Deserialize<List<InvestmentRateTier>>(a.TierSnapshotJson) ?? [], plan.ProjectionMonths) }).ToList() };
    }
    private IQueryable<InvestmentProduct> Products(int userId) => _repository.Get<InvestmentProduct>(x => x.UserId == userId).Include(x => x.Account).Include(x => x.Offers).ThenInclude(x => x.Tiers);
    private async Task ReplaceOffersAsync(InvestmentProduct product, IReadOnlyList<InvestmentOfferInput> inputs)
    {
        var offers = _repository.GetTrack<InvestmentOffer>();
        var existing = await offers.Include(x => x.Tiers).Where(x => x.InvestmentProductId == product.InvestmentProductId).ToListAsync();
        offers.RemoveRange(existing);
        foreach (var input in inputs)
        {
            var offer = new InvestmentOffer { InvestmentProductId = product.InvestmentProductId, CapturedForMonth = Month(input.CapturedForMonth), ValidFrom = input.ValidFrom, ValidTo = input.ValidTo, SourceUrl = Url(input.SourceUrl), SourceLabel = Text(input.SourceLabel, 120, "Source label"), ConditionsConfirmed = input.ConditionsConfirmed, Tiers = input.Tiers.Select(t => new InvestmentRateTier { MinimumAmount = t.MinimumAmount, MaximumAmount = t.MaximumAmount, AnnualRatePercent = t.AnnualRatePercent }).ToList() };
            await _repository.Save(offer);
        }
    }
    private async Task ValidateAccountAsync(int userId, int accountId, int? productId) { var account = await _repository.Get<Account>(a => a.AccountId == accountId && a.UserId == userId).FirstOrDefaultAsync() ?? throw new ArgumentException("Account not found or not accessible."); if (!account.Active || account.IsCredit) throw new ArgumentException("Investment products require an active non-credit account."); if (await _repository.Get<InvestmentProduct>(p => p.UserId == userId && p.AccountId == accountId && p.Active && p.InvestmentProductId != productId).AnyAsync()) throw new ArgumentException("An active investment product already links this account."); }
    private static void ValidateInput(InvestmentProductInput input)
    {
        if (input is null || input.Offers is null || input.Offers.Count == 0) throw new ArgumentException("Product requires at least one offer.");
        Text(input.Name, 120, "Product name");
        Text(input.Institution, 120, "Institution");
        var capturedMonths = new HashSet<string>(StringComparer.Ordinal);
        foreach (var offer in input.Offers)
        {
            var capturedForMonth = Month(offer.CapturedForMonth);
            if (!capturedMonths.Add(capturedForMonth)) throw new ArgumentException("Each offer must use a different captured month.");
            if (offer.ValidTo < offer.ValidFrom) throw new ArgumentException("Offer validity is required.");
            Text(offer.SourceLabel, 120, "Source label");
            Url(offer.SourceUrl);
            InvestmentCalculator.ValidateTierSchedule(offer.Tiers.Select(t => new InvestmentRateTier
            {
                MinimumAmount = t.MinimumAmount,
                MaximumAmount = t.MaximumAmount,
                AnnualRatePercent = t.AnnualRatePercent
            }).ToList());
        }
    }
    private static string Month(string value) { if (!DateTime.TryParseExact(value, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) throw new ArgumentException("planMonth must use yyyy-MM format."); return value; }
    private static string Text(string value, int max, string name) { value = value?.Trim() ?? ""; if (value.Length == 0 || value.Length > max) throw new ArgumentException($"{name} is required and cannot exceed {max} characters."); return value; }
    private static string Url(string value) { if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps || value.Length > 500) throw new ArgumentException("sourceUrl must be an HTTPS URL."); return uri.ToString(); }
}
