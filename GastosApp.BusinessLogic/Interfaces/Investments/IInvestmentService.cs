using GastosApp.BusinessLogic.Models.Investments;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces;

public interface IInvestmentService
{
    Task<IReadOnlyList<InvestmentProduct>> ListProductsAsync(int userId);
    Task<InvestmentProduct?> GetProductAsync(int id, int userId);
    Task<InvestmentProduct> CreateProductAsync(int userId, InvestmentProductInput input);
    Task<InvestmentProduct?> UpdateProductAsync(int id, int userId, InvestmentProductInput input);
    Task<bool> SetProductActiveAsync(int id, int userId, bool active);
    Task<InvestmentPlanResult?> GetPlanAsync(int id, int userId);
    Task<InvestmentPlanResult?> GetCurrentPlanAsync(int userId, string? planMonth);
    Task<InvestmentPlanResult> GeneratePlanAsync(int userId, string planMonth, int projectionMonths);
}
