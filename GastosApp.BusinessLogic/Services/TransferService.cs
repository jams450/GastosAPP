using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class TransferService : ITransferService
    {
        private readonly IRepository _repository;
        private readonly IAccountService _accountService;
        private readonly ITransactionTagService _tagService;
        private readonly ITransactionValidationService _validation;

        public TransferService(IRepository repository, IAccountService accountService, ITransactionTagService tagService, ITransactionValidationService validation)
        {
            _repository = repository;
            _accountService = accountService;
            _tagService = tagService;
            _validation = validation;
        }

        public async Task<(bool Success, string? ErrorMessage)> CreateTransferAsync(int sourceAccountId, int destinationAccountId, decimal amount, string? description = null, DateTime? transactionDate = null, int? categoryId = null, int? subcategoryId = null, int? merchantId = null, IEnumerable<string>? tags = null)
        {
            if (amount <= 0) return (false, "El monto debe ser mayor a cero");
            if (sourceAccountId == destinationAccountId) return (false, "Las cuentas de origen y destino deben ser diferentes");

            var sourceAccount = await _accountService.GetByIdAsync(sourceAccountId);
            if (sourceAccount == null) return (false, "Cuenta de origen no encontrada");
            var destinationAccount = await _accountService.GetByIdAsync(destinationAccountId);
            if (destinationAccount == null) return (false, "Cuenta de destino no encontrada");
            if (sourceAccount.CurrentBalance < amount) return (false, "Saldo insuficiente en la cuenta de origen");

            var transferGroupId = Guid.NewGuid();
            var date = _validation.EnsureUtc(transactionDate ?? DateTime.UtcNow);

            var sourceTransaction = new Transaction
            {
                AccountId = sourceAccountId,
                CategoryId = categoryId,
                SubcategoryId = subcategoryId,
                MerchantId = merchantId,
                Type = "transfer",
                TransferGroupId = transferGroupId,
                Amount = amount,
                BalanceImpact = amount * -1,
                Direction = "debit",
                CounterpartyAccountId = destinationAccountId,
                Description = description ?? $"Transferencia a {destinationAccount.Name}",
                TransactionDate = date
            };

            var destinationTransaction = new Transaction
            {
                AccountId = destinationAccountId,
                CategoryId = categoryId,
                SubcategoryId = subcategoryId,
                MerchantId = merchantId,
                Type = "transfer",
                TransferGroupId = transferGroupId,
                Amount = amount,
                BalanceImpact = amount,
                Direction = "credit",
                CounterpartyAccountId = sourceAccountId,
                Description = description ?? $"Transferencia desde {sourceAccount.Name}",
                TransactionDate = date
            };

            var createdSource = await _repository.Save(sourceTransaction);
            var createdDestination = await _repository.Save(destinationTransaction);

            await _tagService.SyncTransactionTagsAsync(createdSource.TransactionId, sourceAccount.UserId, tags);
            await _tagService.SyncTransactionTagsAsync(createdDestination.TransactionId, destinationAccount.UserId, tags);

            await UpdateAccountBalanceAsync(sourceAccountId, -amount);
            await UpdateAccountBalanceAsync(destinationAccountId, amount);
            return (true, null);
        }

        public async Task<bool> DeleteTransferAsync(Guid transferGroupId)
        {
            var transactions = await _repository.Get<Transaction>(t => t.TransferGroupId == transferGroupId).ToListAsync();
            if (transactions.Count != 2) return false;

            foreach (var transaction in transactions)
            {
                var balanceImpact = transaction.BalanceImpact;
                if (balanceImpact == 0)
                {
                    balanceImpact = await _validation.InferLegacyBalanceImpactAsync(transaction);
                }

                await UpdateAccountBalanceAsync(transaction.AccountId, balanceImpact * -1);
            }

            await _repository.RemoveRangeAsync(transactions);
            return true;
        }

        public async Task<(bool Success, string? ErrorMessage)> UpdateTransferMetadataAsync(Guid transferGroupId, int userId, int? categoryId, int? subcategoryId, int? merchantId, string? description, DateTime? transactionDate, IEnumerable<string>? tags)
        {
            var transactions = await _repository.GetTrack<Transaction>().Where(t => t.TransferGroupId == transferGroupId).ToListAsync();
            if (transactions.Count != 2) return (false, "Transfer not found");

            var ownerChecks = await Task.WhenAll(transactions.Select(t => _accountService.GetByIdAsync(t.AccountId)));
            if (ownerChecks.Any(a => a == null || a.UserId != userId)) return (false, "Transfer not found");

            var sample = transactions[0];
            var effectiveCategoryId = categoryId ?? sample.CategoryId;
            var effectiveSubcategoryId = subcategoryId ?? sample.SubcategoryId;
            var effectiveMerchantId = merchantId ?? sample.MerchantId;

            var dimensionsValidation = await _validation.ValidateAnalyticsDimensionsAsync(userId, effectiveCategoryId, effectiveSubcategoryId, effectiveMerchantId);
            if (!dimensionsValidation.IsValid) return (false, dimensionsValidation.ErrorMessage);

            foreach (var transaction in transactions)
            {
                if (categoryId.HasValue) transaction.CategoryId = categoryId.Value;
                if (subcategoryId.HasValue) transaction.SubcategoryId = subcategoryId.Value;
                if (merchantId.HasValue) transaction.MerchantId = merchantId.Value;
                if (description != null) transaction.Description = description;
                if (transactionDate.HasValue) transaction.TransactionDate = _validation.EnsureUtc(transactionDate.Value);
            }

            await _repository.SaveChangesAsync();

            foreach (var transaction in transactions)
            {
                await _tagService.SyncTransactionTagsAsync(transaction.TransactionId, userId, tags);
            }

            return (true, null);
        }

        private async Task UpdateAccountBalanceAsync(int accountId, decimal amount)
        {
            var account = await _repository.GetTrack<Account>().FirstOrDefaultAsync(a => a.AccountId == accountId);
            if (account == null) throw new ArgumentException($"Account with ID {accountId} not found");
            account.CurrentBalance += amount;
            await _repository.SaveChangesAsync();
        }
    }
}
