using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ICreditLifecycleService
    {
        Task<(bool Success, string? ErrorMessage)> RegisterCreditPaymentAsync(
            int creditAccountId,
            int sourceTransactionId,
            DateTime paidAt,
            decimal amount,
            IEnumerable<(int InstallmentId, decimal Amount)> allocations);

        Task<(bool Success, string? ErrorMessage)> ConvertChargeToMsiAsync(int sourceTransactionId, int months);
        Task<(bool Success, string? ErrorMessage, int CreatedCount)> CreateOpeningCreditChargesAsync(
            int creditAccountId,
            IEnumerable<OpeningCreditChargeInput> items);

        Task CreateCreditChargeWithPlanAsync(Transaction transaction, int months, string planType);
        Task SynchronizeCreditChargePlanAsync(int sourceTransactionId, decimal newAmount, DateTime newTransactionDate);
    }
}
