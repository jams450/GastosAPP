using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITransactionValidationService
    {
        Task<(bool IsValid, string? ErrorMessage)> ValidateAnalyticsDimensionsAsync(int userId, int? categoryId, int? subcategoryId, int? merchantId);
        DateTime EnsureUtc(DateTime value);
        string ResolveDirection(decimal balanceImpact);
        decimal ResolveUpdatedBalanceImpact(Transaction transaction, decimal previousImpact);
        Task<decimal> InferLegacyBalanceImpactAsync(Transaction transaction);
    }
}
