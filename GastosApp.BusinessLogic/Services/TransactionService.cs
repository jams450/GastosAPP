using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Services
{
    public class TransactionService : ITransactionService
    {
        private readonly ITransactionQueryService _queryService;
        private readonly ITransactionCommandService _commandService;
        private readonly ITransferService _transferService;
        private readonly ITransactionValidationService _validationService;
        private readonly ITransactionTagService _tagService;
        private readonly IExpenseAllocationService _allocationService;
        private readonly ICreditLifecycleService _creditLifecycleService;

        public TransactionService(
            ITransactionQueryService queryService,
            ITransactionCommandService commandService,
            ITransferService transferService,
            ITransactionValidationService validationService,
            ITransactionTagService tagService,
            IExpenseAllocationService allocationService,
            ICreditLifecycleService creditLifecycleService)
        {
            _queryService = queryService;
            _commandService = commandService;
            _transferService = transferService;
            _validationService = validationService;
            _tagService = tagService;
            _allocationService = allocationService;
            _creditLifecycleService = creditLifecycleService;
        }

        public Task<Transaction?> GetByIdAsync(int id) => _queryService.GetByIdAsync(id);
        public Task<Transaction?> GetByIdForUserAsync(int id, int userId) => _queryService.GetByIdForUserAsync(id, userId);
        public Task<IEnumerable<Transaction>> GetAllByAccountIdAsync(int accountId) => _queryService.GetAllByAccountIdAsync(accountId);
        public Task<IEnumerable<Transaction>> GetAllByAccountIdForUserAsync(int accountId, int userId) => _queryService.GetAllByAccountIdForUserAsync(accountId, userId);
        public Task<IEnumerable<Transaction>> GetByDateRangeAsync(int accountId, DateTime startDate, DateTime endDate) => _queryService.GetByDateRangeAsync(accountId, startDate, endDate);
        public Task<IEnumerable<Transaction>> GetByDateRangeForUserAsync(int accountId, int userId, DateTime startDate, DateTime endDate) => _queryService.GetByDateRangeForUserAsync(accountId, userId, startDate, endDate);
        public Task<IEnumerable<Transaction>> GetByCategoryAsync(int categoryId) => _queryService.GetByCategoryAsync(categoryId);
        public Task<IEnumerable<Transaction>> GetByCategoryForUserAsync(int categoryId, int userId) => _queryService.GetByCategoryForUserAsync(categoryId, userId);
        public Task<Transaction> CreateIncomeAsync(Transaction transaction) => _commandService.CreateIncomeAsync(transaction);
        public Task<Transaction> CreateExpenseAsync(Transaction transaction, int userId, IEnumerable<ExpenseAllocationInput>? allocations = null) => _commandService.CreateExpenseAsync(transaction, userId, allocations);
        public Task<(bool Success, string? ErrorMessage)> CreateTransferAsync(int userId, int sourceAccountId, int destinationAccountId, decimal amount, string? description = null, DateTime? transactionDate = null, int? categoryId = null, int? subcategoryId = null, int? merchantId = null, IEnumerable<string>? tags = null)
            => _transferService.CreateTransferAsync(userId, sourceAccountId, destinationAccountId, amount, description, transactionDate, categoryId, subcategoryId, merchantId, tags);
        public Task<Transaction?> UpdateAsync(int id, Transaction transaction) => _commandService.UpdateAsync(id, transaction);
        public Task<Transaction?> UpdateForUserAsync(int id, int userId, Transaction transaction) => _commandService.UpdateForUserAsync(id, userId, transaction);
        public Task<bool> DeleteAsync(int id) => _commandService.DeleteAsync(id);
        public Task<bool> DeleteForUserAsync(int id, int userId) => _commandService.DeleteForUserAsync(id, userId);
        public Task<bool> DeleteTransferAsync(Guid transferGroupId, int userId) => _transferService.DeleteTransferAsync(transferGroupId, userId);
        public Task<(bool Success, string? ErrorMessage)> UpdateTransferMetadataAsync(Guid transferGroupId, int userId, int? categoryId, int? subcategoryId, int? merchantId, string? description, DateTime? transactionDate, IEnumerable<string>? tags)
            => _transferService.UpdateTransferMetadataAsync(transferGroupId, userId, categoryId, subcategoryId, merchantId, description, transactionDate, tags);
        public Task<decimal> CalculateAccountBalanceAsync(int accountId) => _queryService.CalculateAccountBalanceAsync(accountId);
        public Task<(bool IsValid, string? ErrorMessage)> ValidateAnalyticsDimensionsAsync(int userId, int? categoryId, int? subcategoryId, int? merchantId)
            => _validationService.ValidateAnalyticsDimensionsAsync(userId, categoryId, subcategoryId, merchantId);
        public Task SyncTransactionTagsAsync(int transactionId, int userId, IEnumerable<string>? tagNames) => _tagService.SyncTransactionTagsAsync(transactionId, userId, tagNames);
        public Task<(bool Success, string? ErrorMessage)> ReplaceExpenseAllocationsAsync(int transactionId, int userId, IEnumerable<ExpenseAllocationInput>? allocations, bool fallbackToSelfWhenEmpty = true)
            => _allocationService.ReplaceExpenseAllocationsAsync(transactionId, userId, allocations, fallbackToSelfWhenEmpty);
        public Task<(bool Success, string? ErrorMessage)> RegisterCreditPaymentAsync(int creditAccountId, int sourceTransactionId, DateTime paidAt, decimal amount, IEnumerable<(int InstallmentId, decimal Amount)> allocations)
            => _creditLifecycleService.RegisterCreditPaymentAsync(creditAccountId, sourceTransactionId, paidAt, amount, allocations);
        public Task<(bool Success, string? ErrorMessage)> ConvertChargeToMsiAsync(int sourceTransactionId, int months)
            => _creditLifecycleService.ConvertChargeToMsiAsync(sourceTransactionId, months);
        public Task<IEnumerable<CreditInstallmentOpenItem>> GetOpenCreditInstallmentsAsync(int creditAccountId)
            => _queryService.GetOpenCreditInstallmentsAsync(creditAccountId);
        public Task<IEnumerable<CreditChargeSummaryItem>> GetCreditChargeSummariesAsync(IEnumerable<int> sourceTransactionIds)
            => _queryService.GetCreditChargeSummariesAsync(sourceTransactionIds);
        public Task<(bool Success, string? ErrorMessage, int CreatedCount)> CreateOpeningCreditChargesAsync(int creditAccountId, IEnumerable<OpeningCreditChargeInput> items)
            => _creditLifecycleService.CreateOpeningCreditChargesAsync(creditAccountId, items);
    }
}
