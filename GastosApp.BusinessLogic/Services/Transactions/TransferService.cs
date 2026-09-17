using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;
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
        private readonly ICreditLifecycleService _creditLifecycleService;

        public TransferService(IRepository repository, IAccountService accountService, ITransactionTagService tagService, ITransactionValidationService validation, ICreditLifecycleService creditLifecycleService)
        {
            _repository = repository;
            _accountService = accountService;
            _tagService = tagService;
            _validation = validation;
            _creditLifecycleService = creditLifecycleService;
        }

        public async Task<(bool Success, string? ErrorMessage, Guid? TransferGroupId, int? SourceTransactionId, int? DestinationTransactionId)> CreateTransferAsync(int userId, int sourceAccountId, int destinationAccountId, decimal amount, string? description = null, DateTime? transactionDate = null, int? categoryId = null, int? subcategoryId = null, int? merchantId = null, IEnumerable<string>? tags = null, IEnumerable<(int InstallmentId, decimal Amount)>? creditAllocations = null)
        {
            if (amount <= 0) return (false, "El monto debe ser mayor a cero", null, null, null);
            if (sourceAccountId == destinationAccountId) return (false, "Las cuentas de origen y destino deben ser diferentes", null, null, null);

            var sourceAccount = await _accountService.GetByIdAsync(sourceAccountId);
            if (sourceAccount == null) return (false, "Cuenta de origen no encontrada", null, null, null);
            var destinationAccount = await _accountService.GetByIdAsync(destinationAccountId);
            if (destinationAccount == null) return (false, "Cuenta de destino no encontrada", null, null, null);
            if (sourceAccount.UserId != userId || destinationAccount.UserId != userId) return (false, "Transfer not found", null, null, null);
            var transferGroupId = Guid.NewGuid();
            var date = _validation.EnsureUtc(transactionDate ?? DateTime.UtcNow);

            var sourceTransaction = new Transaction
            {
                AccountId = sourceAccountId,
                CategoryId = categoryId,
                SubcategoryId = subcategoryId,
                MerchantId = merchantId,
                Type = TransactionDomainConstants.TransactionType.Transfer,
                TransferGroupId = transferGroupId,
                Amount = amount,
                BalanceImpact = amount * -1,
                Direction = TransactionDomainConstants.Direction.Debit,
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
                Type = TransactionDomainConstants.TransactionType.Transfer,
                TransferGroupId = transferGroupId,
                Amount = amount,
                BalanceImpact = amount,
                Direction = TransactionDomainConstants.Direction.Credit,
                CounterpartyAccountId = sourceAccountId,
                Description = description ?? $"Transferencia desde {sourceAccount.Name}",
                TransactionDate = date
            };

            try
            {
                return await _repository.ExecuteInTransactionAsync<(bool Success, string? ErrorMessage, Guid? TransferGroupId, int? SourceTransactionId, int? DestinationTransactionId)>(async () =>
                {
                    var lockedAccounts = await _repository.LockAccountsAsync([sourceAccountId, destinationAccountId]);
                    if (lockedAccounts.Count != 2 || lockedAccounts.Any(a => a.UserId != userId))
                    {
                        return (false, "Transfer not found", null, null, null);
                    }

                    var dimensionsValidation = await _validation.ValidateAnalyticsDimensionsAsync(
                        userId,
                        categoryId,
                        subcategoryId,
                        merchantId);
                    if (!dimensionsValidation.IsValid)
                    {
                        return (false, dimensionsValidation.ErrorMessage, null, null, null);
                    }

                    sourceAccount = lockedAccounts.Single(a => a.AccountId == sourceAccountId);
                    destinationAccount = lockedAccounts.Single(a => a.AccountId == destinationAccountId);
                    sourceTransaction.Description ??= $"Transferencia a {destinationAccount.Name}";
                    destinationTransaction.Description ??= $"Transferencia desde {sourceAccount.Name}";

                    var createdSource = await _repository.Save(sourceTransaction);
                    var createdDestination = await _repository.Save(destinationTransaction);

                    await _tagService.SyncTransactionTagsAsync(userId, [createdSource.TransactionId, createdDestination.TransactionId], tags);

                    await UpdateAccountBalanceAsync(sourceAccountId, -amount);
                    await UpdateAccountBalanceAsync(destinationAccountId, amount);

                    if (destinationAccount.IsCredit)
                    {
                        var allocationItems = creditAllocations?.Where(a => a.InstallmentId > 0 && a.Amount > 0).ToList() ?? [];
                        var paymentResult = await _creditLifecycleService.RegisterCreditPaymentAsync(
                            userId,
                            destinationAccount.AccountId,
                            createdDestination.TransactionId,
                            createdDestination.TransactionDate,
                            createdDestination.Amount,
                            allocationItems);

                        if (!paymentResult.Success)
                        {
                            throw new ArgumentException(paymentResult.ErrorMessage ?? "No se pudo registrar pago de crédito");
                        }
                    }

                    return (true, null, (Guid?)transferGroupId, (int?)createdSource.TransactionId, (int?)createdDestination.TransactionId);
                });
            }
            catch (ArgumentException ex)
            {
                return (false, ex.Message, null, null, null);
            }
        }

        public Task<bool> DeleteTransferAsync(Guid transferGroupId, int userId)
        {
            return _repository.ExecuteInTransactionAsync(async () =>
            {
                var accountIds = await _repository.Get<Transaction>()
                    .Where(t => t.TransferGroupId == transferGroupId)
                    .Select(t => t.AccountId)
                    .Distinct()
                    .ToListAsync();
                var lockedAccounts = await _repository.LockAccountsAsync(accountIds);
                if (lockedAccounts.Count != 2 || lockedAccounts.Any(a => a.UserId != userId)) return false;

                var transactions = await _repository.LockTransferTransactionsAsync(transferGroupId);
                var pairValidation = ValidateTransferPair(transactions, transferGroupId, userId, lockedAccounts);
                if (!pairValidation.Success) return false;

                foreach (var transaction in transactions)
                {
                    var paymentResult = await _creditLifecycleService.ReverseCreditPaymentSourceAsync(transaction.TransactionId);
                    if (!paymentResult.Success)
                    {
                        throw new ArgumentException(paymentResult.ErrorMessage ?? "No se pudo revertir el pago de crédito");
                    }

                    var balanceImpact = transaction.BalanceImpact;
                    if (balanceImpact == 0)
                    {
                        balanceImpact = await _validation.InferLegacyBalanceImpactAsync(transaction);
                    }

                    await UpdateAccountBalanceAsync(transaction.AccountId, balanceImpact * -1);
                }

                var deleted = await _repository.RemoveRangeAsync(transactions);
                return deleted == transactions.Count;
            });
        }

        public Task<(bool Success, string? ErrorMessage)> UpdateTransferMetadataAsync(Guid transferGroupId, int userId, int? categoryId, int? subcategoryId, int? merchantId, string? description, DateTime? transactionDate, IEnumerable<string>? tags, bool clearAnalytics)
        {
            return _repository.ExecuteInTransactionAsync(() => UpdateTransferMetadataInternalAsync(transferGroupId, userId, categoryId, subcategoryId, merchantId, description, transactionDate, tags, clearAnalytics));
        }

        private async Task<(bool Success, string? ErrorMessage)> UpdateTransferMetadataInternalAsync(Guid transferGroupId, int userId, int? categoryId, int? subcategoryId, int? merchantId, string? description, DateTime? transactionDate, IEnumerable<string>? tags, bool clearAnalytics)
        {
            var accountIds = await _repository.Get<Transaction>()
                .Where(t => t.TransferGroupId == transferGroupId)
                .Select(t => t.AccountId)
                .Distinct()
                .ToListAsync();
            var lockedAccounts = await _repository.LockAccountsAsync(accountIds);
            if (lockedAccounts.Count != 2 || lockedAccounts.Any(a => a.UserId != userId))
            {
                return (false, "Transfer not found");
            }

            var transactions = await _repository.LockTransferTransactionsAsync(transferGroupId);
            var pairValidation = ValidateTransferPair(transactions, transferGroupId, userId, lockedAccounts);
            if (!pairValidation.Success) return (false, pairValidation.ErrorMessage);

            var sample = transactions[0];
            var effectiveCategoryId = clearAnalytics ? null : categoryId ?? sample.CategoryId;
            var effectiveSubcategoryId = clearAnalytics ? null : subcategoryId ?? sample.SubcategoryId;
            var effectiveMerchantId = clearAnalytics ? null : merchantId ?? sample.MerchantId;

            var dimensionsValidation = await _validation.ValidateAnalyticsDimensionsAsync(userId, effectiveCategoryId, effectiveSubcategoryId, effectiveMerchantId);
            if (!dimensionsValidation.IsValid) return (false, dimensionsValidation.ErrorMessage);

            var updatedTransactionDate = transactionDate.HasValue
                ? _validation.EnsureUtc(transactionDate.Value)
                : (DateTime?)null;

            foreach (var transaction in transactions)
            {
                if (clearAnalytics)
                {
                    transaction.CategoryId = null;
                    transaction.SubcategoryId = null;
                    transaction.MerchantId = null;
                }
                else
                {
                    if (categoryId.HasValue) transaction.CategoryId = categoryId.Value;
                    if (subcategoryId.HasValue) transaction.SubcategoryId = subcategoryId.Value;
                    if (merchantId.HasValue) transaction.MerchantId = merchantId.Value;
                }
                if (description != null) transaction.Description = description;
                if (updatedTransactionDate.HasValue) transaction.TransactionDate = updatedTransactionDate.Value;
            }

            if (updatedTransactionDate.HasValue)
            {
                var destinationTransactionId = transactions
                    .Single(t => string.Equals(t.Direction, TransactionDomainConstants.Direction.Credit, StringComparison.OrdinalIgnoreCase))
                    .TransactionId;
                var creditPayment = await _repository.GetTrack<CreditPayment>()
                    .FirstOrDefaultAsync(p => p.SourceTransactionId == destinationTransactionId);
                if (creditPayment != null)
                {
                    creditPayment.PaidAt = updatedTransactionDate.Value;
                }
            }

            await _repository.SaveChangesAsync();

            if (tags != null)
            {
                await _tagService.SyncTransactionTagsAsync(userId, transactions.Select(t => t.TransactionId).ToList(), tags);
            }

            return (true, null);
        }

        private (bool Success, string? ErrorMessage) ValidateTransferPair(IReadOnlyCollection<Transaction> transactions, Guid transferGroupId, int userId, IReadOnlyCollection<Account> lockedAccounts)
        {
            if (transactions.Count != 2 || transactions.Any(t => t.TransferGroupId != transferGroupId))
            {
                return (false, "Transfer not found");
            }

            // Reutiliza las cuentas ya lockeadas por el llamador (mismas instancias rastreadas): sin re-SELECT.
            if (lockedAccounts.Count != 2 || lockedAccounts.Any(a => a.UserId != userId))
            {
                return (false, "Transfer not found");
            }

            var debits = transactions.Where(t => string.Equals(t.Direction, TransactionDomainConstants.Direction.Debit, StringComparison.OrdinalIgnoreCase)).ToList();
            var credits = transactions.Where(t => string.Equals(t.Direction, TransactionDomainConstants.Direction.Credit, StringComparison.OrdinalIgnoreCase)).ToList();
            if (debits.Count != 1 || credits.Count != 1 ||
                transactions.Any(t => !string.Equals(t.Type, TransactionDomainConstants.TransactionType.Transfer, StringComparison.OrdinalIgnoreCase)))
            {
                return (false, "Transfer not found");
            }

            var debit = debits[0];
            var credit = credits[0];
            if (debit.AccountId == credit.AccountId ||
                debit.CounterpartyAccountId != credit.AccountId ||
                credit.CounterpartyAccountId != debit.AccountId ||
                debit.Amount != credit.Amount)
            {
                return (false, "Transfer not found");
            }

            return (true, null);
        }

        private async Task UpdateAccountBalanceAsync(int accountId, decimal amount)
        {
            var updated = await _repository.UpdateAccountBalanceAsync(accountId, amount, amount < 0);
            if (!updated)
            {
                throw new ArgumentException(amount < 0
                    ? "Saldo insuficiente en la cuenta de origen"
                    : $"Account with ID {accountId} not found");
            }
        }
    }
}
