using GastosApp.BusinessLogic.Models.Investments;

namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// Investment catalog and monthly plan service. Every method is user-scoped: the caller supplies the
/// authenticated user id, never an id taken from the request body, and no method returns EF entities.
/// </summary>
public interface IInvestmentService
{
    Task<IReadOnlyList<InvestmentProductResult>> ListProductsAsync(int userId);
    Task<InvestmentProductResult?> GetProductAsync(int id, int userId);
    Task<InvestmentProductResult> CreateProductAsync(int userId, InvestmentProductInput input);
    Task<InvestmentProductResult?> UpdateProductAsync(int id, int userId, InvestmentProductInput input);
    Task<bool> SetProductActiveAsync(int id, int userId, bool active);

    /// <summary>Persisted plan for the month, or a derived, never-persisted draft carried from the previous plan.</summary>
    Task<InvestmentPlanResult?> GetCurrentPlanAsync(int userId, string? planMonth);

    /// <summary>Plan detail (allocations + exclusions). No monthly series.</summary>
    Task<InvestmentPlanResult?> GetPlanAsync(int id, int userId);

    /// <summary>Projection view: monthly series per allocation plus the recorded exclusions.</summary>
    Task<InvestmentPlanProjectionResult?> GetPlanProjectionAsync(int id, int userId);

    Task<InvestmentPlanResult> GeneratePlanAsync(int userId, InvestmentPlanGenerateInput input);
}
