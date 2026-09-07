using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class TransactionCommandService : ITransactionCommandService
    {
        private readonly IRepository _repository;
        private readonly IAccountService _accountService;
        private readonly IExpenseAllocationService _allocationService;
        private readonly ICreditLifecycleService _creditLifecycleService;
        private readonly ITransactionValidationService _validation;
        private readonly ITransactionTagService _tagService;

        public TransactionCommandService(
            IRepository repository,
            IAccountService accountService,
            IExpenseAllocationService allocationService,
            ICreditLifecycleService creditLifecycleService,
            ITransactionValidationService validation,
            ITransactionTagService tagService)
        {
            _repository = repository;
            _accountService = accountService;
            _allocationService = allocationService;
            _creditLifecycleService = creditLifecycleService;
            _validation = validation;
            _tagService = tagService;
        }

        public Task<Transaction> CreateIncomeAsync(Transaction transaction, int userId, IEnumerable<(int InstallmentId, decimal Amount)>? creditAllocations = null, IEnumerable<string>? tags = null)
        {
            return _repository.ExecuteInTransactionAsync(async () =>
            {
                if (transaction.Amount <= 0)
                {
                    throw new ArgumentException("El monto del ingreso debe ser mayor a cero");
                }

                var lockedAccounts = await _repository.LockAccountsAsync([transaction.AccountId]);
                var account = lockedAccounts.SingleOrDefault();
                if (account == null || account.UserId != userId)
                {
                    throw new ArgumentException("La cuenta indicada no existe");
                }

                var dimensionsValidation = await _validation.ValidateAnalyticsDimensionsAsync(
                    userId,
                    transaction.CategoryId,
                    transaction.SubcategoryId,
                    transaction.MerchantId,
                    TransactionDomainConstants.TransactionType.Income);
                if (!dimensionsValidation.IsValid)
                {
                    throw new ArgumentException(dimensionsValidation.ErrorMessage ?? "Dimensiones analíticas inválidas");
                }

                transaction.Type = TransactionDomainConstants.TransactionType.Income;
                transaction.BalanceImpact = transaction.Amount;
                transaction.Direction = TransactionDomainConstants.Direction.Credit;
                transaction.CounterpartyAccountId = null;
                transaction.TransactionDate = _validation.EnsureUtc(transaction.TransactionDate);

                var result = await _repository.Save(transaction);
                await _tagService.SyncTransactionTagsAsync(result.TransactionId, userId, tags);
                await UpdateAccountBalanceAsync(transaction.AccountId, transaction.Amount);

                if (account.IsCredit)
                {
                    var paymentResult = await _creditLifecycleService.RegisterCreditPaymentAsync(
                        account.AccountId,
                        result.TransactionId,
                        result.TransactionDate,
                        result.Amount,
                        creditAllocations ?? []);

                    if (!paymentResult.Success)
                    {
                        throw new ArgumentException(paymentResult.ErrorMessage ?? "No se pudo registrar pago de crédito");
                    }
                }

                return result;
            });
        }

        public Task<Transaction> CreateExpenseAsync(Transaction transaction, int userId, IEnumerable<ExpenseAllocationInput>? allocations = null, IEnumerable<string>? tags = null, int? msiMonths = null)
        {
            if (msiMonths.HasValue && msiMonths.Value > 60)
            {
                throw new ArgumentException("Meses MSI debe estar entre 1 y 60");
            }

            return _repository.ExecuteInTransactionAsync(async () =>
            {
                if (transaction.Amount <= 0)
                {
                    throw new ArgumentException("El monto del gasto debe ser mayor a cero");
                }

                var lockedAccounts = await _repository.LockAccountsAsync([transaction.AccountId]);
                var account = lockedAccounts.SingleOrDefault();
                if (account == null || account.UserId != userId)
                {
                    throw new ArgumentException("La cuenta indicada no existe");
                }

                var dimensionsValidation = await _validation.ValidateAnalyticsDimensionsAsync(
                    userId,
                    transaction.CategoryId,
                    transaction.SubcategoryId,
                    transaction.MerchantId,
                    TransactionDomainConstants.TransactionType.Expense);
                if (!dimensionsValidation.IsValid)
                {
                    throw new ArgumentException(dimensionsValidation.ErrorMessage ?? "Dimensiones analíticas inválidas");
                }

                transaction.Type = TransactionDomainConstants.TransactionType.Expense;
                transaction.BalanceImpact = transaction.Amount * -1;
                transaction.Direction = TransactionDomainConstants.Direction.Debit;
                transaction.CounterpartyAccountId = null;
                transaction.TransactionDate = _validation.EnsureUtc(transaction.TransactionDate);

                var result = await _repository.Save(transaction);
                var allocationResult = await _allocationService.ReplaceExpenseAllocationsAsync(result.TransactionId, userId, allocations, true);
                if (!allocationResult.Success)
                {
                    throw new ArgumentException(allocationResult.ErrorMessage ?? "Invalid expense allocation");
                }

                await _tagService.SyncTransactionTagsAsync(result.TransactionId, userId, tags);
                await UpdateAccountBalanceAsync(transaction.AccountId, -transaction.Amount);
                if (account.IsCredit)
                {
                    await _creditLifecycleService.CreateCreditChargeWithPlanAsync(result, 1, TransactionDomainConstants.CreditPlanType.Revolving);

                    if (msiMonths.HasValue && msiMonths.Value > 1)
                    {
                        var convertResult = await _creditLifecycleService.ConvertChargeToMsiAsync(result.TransactionId, msiMonths.Value);
                        if (!convertResult.Success)
                        {
                            throw new ArgumentException(convertResult.ErrorMessage ?? "No se pudo convertir cargo a MSI");
                        }
                    }
                }

                return result;
            });
        }

        public async Task<Transaction?> UpdateAsync(int id, Transaction transaction)
        {
            var existing = await _repository.GetByIdAsync<Transaction>(id);
            if (existing == null) return null;

            return await UpdateInternalAsync(id, transaction, existing);
        }

        public async Task<Transaction?> UpdateForUserAsync(int id, int userId, Transaction transaction)
        {
            var existing = await _repository.Get<Transaction>(t => t.TransactionId == id && t.Account.UserId == userId).FirstOrDefaultAsync();
            if (existing == null) return null;

            return await UpdateInternalAsync(id, transaction, existing);
        }

        public Task<(Transaction? Transaction, string? ErrorMessage)> UpdateTransactionWithDetailsForUserAsync(
            int id,
            int userId,
            Transaction transaction,
            IEnumerable<string>? tags,
            IEnumerable<ExpenseAllocationInput>? allocations,
            bool replaceAllocations)
        {
            return _repository.ExecuteInTransactionAsync(async () =>
            {
                var transactionAccount = await _repository.Get<Transaction>(t => t.TransactionId == id)
                    .Select(t => new { t.AccountId, t.Account.UserId })
                    .FirstOrDefaultAsync();
                if (transactionAccount == null || transactionAccount.UserId != userId)
                {
                    return ((Transaction?)null, "Transaction not found");
                }

                var lockedAccounts = await _repository.LockAccountsAsync([transactionAccount.AccountId]);
                if (lockedAccounts.Count != 1 || lockedAccounts[0].UserId != userId)
                {
                    return ((Transaction?)null, "Transaction not found");
                }

                var existing = await _repository.LockTransactionAsync(id);
                if (existing == null || existing.AccountId != transactionAccount.AccountId)
                {
                    return ((Transaction?)null, "Transaction not found");
                }

                if (transaction.Amount <= 0)
                {
                    throw new ArgumentException("El monto de la transacción debe ser mayor a cero");
                }

                var requiredCategoryType = existing.Type.ToLowerInvariant() switch
                {
                    TransactionDomainConstants.TransactionType.Income => TransactionDomainConstants.TransactionType.Income,
                    TransactionDomainConstants.TransactionType.Expense or TransactionDomainConstants.TransactionType.OpeningCredit => TransactionDomainConstants.TransactionType.Expense,
                    _ => null
                };
                var dimensionsValidation = await _validation.ValidateAnalyticsDimensionsAsync(
                    userId,
                    transaction.CategoryId,
                    transaction.SubcategoryId,
                    transaction.MerchantId,
                    requiredCategoryType);
                if (!dimensionsValidation.IsValid)
                {
                    throw new ArgumentException(dimensionsValidation.ErrorMessage ?? "Dimensiones analíticas inválidas");
                }

                if (existing.Type == TransactionDomainConstants.TransactionType.Income && existing.Amount != transaction.Amount)
                {
                    var hasCreditPayment = await _repository.Get<CreditPayment>(p => p.SourceTransactionId == id).AnyAsync();
                    if (hasCreditPayment)
                    {
                        throw new ArgumentException("No se puede actualizar el monto de un ingreso aplicado como pago de crédito");
                    }
                }

                var expenseAmountOrDateChanged = existing.Type is TransactionDomainConstants.TransactionType.Expense or TransactionDomainConstants.TransactionType.OpeningCredit &&
                    (existing.Amount != transaction.Amount ||
                     _validation.EnsureUtc(existing.TransactionDate) != _validation.EnsureUtc(transaction.TransactionDate));
                if (expenseAmountOrDateChanged)
                {
                    var hasInstallmentAllocations = await _repository.Get<CreditCharge>(c => c.SourceTransactionId == id)
                        .SelectMany(c => c.InstallmentPlan!.Installments)
                        .SelectMany(i => i.Allocations)
                        .AnyAsync();
                    if (hasInstallmentAllocations)
                    {
                        throw new ArgumentException("No se puede actualizar el monto o fecha de un gasto de crédito con pagos asignados");
                    }
                }

                var updated = await UpdateInternalAsync(id, transaction, existing);
                await _tagService.SyncTransactionTagsAsync(id, userId, tags);

                if (replaceAllocations)
                {
                    var allocationResult = await _allocationService.ReplaceExpenseAllocationsAsync(id, userId, allocations, true);
                    if (!allocationResult.Success)
                    {
                        throw new ArgumentException(allocationResult.ErrorMessage ?? "Invalid expense allocation");
                    }
                }

                return (updated, (string?)null);
            });
        }

        public Task<bool> DeleteAsync(int id)
        {
            return _repository.ExecuteInTransactionAsync(async () =>
            {
                var transactionAccount = await _repository.Get<Transaction>(t => t.TransactionId == id)
                    .Select(t => t.AccountId)
                    .FirstOrDefaultAsync();
                if (transactionAccount == 0) return false;

                await _repository.LockAccountsAsync([transactionAccount]);
                var transaction = await _repository.LockTransactionAsync(id);
                if (transaction == null || transaction.AccountId != transactionAccount || IsTransfer(transaction)) return false;

                return await DeleteInternalAsync(id, transaction);
            });
        }

        public Task<bool> DeleteForUserAsync(int id, int userId)
        {
            return _repository.ExecuteInTransactionAsync(async () =>
            {
                var transactionAccount = await _repository.Get<Transaction>(t => t.TransactionId == id)
                    .Select(t => new { t.AccountId, t.Account.UserId })
                    .FirstOrDefaultAsync();
                if (transactionAccount == null || transactionAccount.UserId != userId) return false;

                var lockedAccounts = await _repository.LockAccountsAsync([transactionAccount.AccountId]);
                if (lockedAccounts.Count != 1 || lockedAccounts[0].UserId != userId) return false;

                var transaction = await _repository.LockTransactionAsync(id);
                if (transaction == null || transaction.AccountId != transactionAccount.AccountId || IsTransfer(transaction)) return false;

                return await DeleteInternalAsync(id, transaction);
            });
        }

        private static bool IsTransfer(Transaction transaction)
        {
            return string.Equals(transaction.Type, TransactionDomainConstants.TransactionType.Transfer, StringComparison.OrdinalIgnoreCase);
        }

        private async Task<Transaction?> UpdateInternalAsync(int id, Transaction transaction, Transaction existing)
        {
            transaction.TransactionDate = _validation.EnsureUtc(transaction.TransactionDate);
            var expenseAmountOrDateChanged = transaction.Type is TransactionDomainConstants.TransactionType.Expense or TransactionDomainConstants.TransactionType.OpeningCredit &&
                (existing.Amount != transaction.Amount ||
                 _validation.EnsureUtc(existing.TransactionDate) != transaction.TransactionDate);

            var previousImpact = existing.BalanceImpact;
            if (previousImpact == 0)
            {
                previousImpact = await _validation.InferLegacyBalanceImpactAsync(existing);
            }

            transaction.BalanceImpact = _validation.ResolveUpdatedBalanceImpact(transaction, previousImpact);
            transaction.Direction = _validation.ResolveDirection(transaction.BalanceImpact);
            if (transaction.Type != TransactionDomainConstants.TransactionType.Transfer)
            {
                transaction.CounterpartyAccountId = null;
            }

            transaction.TransactionId = id;
            var result = await _repository.SaveUpdate(id, transaction);

            var adjustment = transaction.BalanceImpact - previousImpact;
            if (adjustment != 0)
            {
                await UpdateAccountBalanceAsync(existing.AccountId, adjustment);
            }

            if (expenseAmountOrDateChanged)
            {
                await _creditLifecycleService.SynchronizeCreditChargePlanAsync(id, transaction.Amount, transaction.TransactionDate);
            }

            return result;
        }

        private async Task<bool> DeleteInternalAsync(int id, Transaction transaction)
        {
            if (transaction.Type is TransactionDomainConstants.TransactionType.Expense or TransactionDomainConstants.TransactionType.OpeningCredit)
            {
                var hasInstallmentAllocations = await _repository.Get<CreditCharge>(c => c.SourceTransactionId == id)
                    .SelectMany(c => c.InstallmentPlan!.Installments)
                    .SelectMany(i => i.Allocations)
                    .AnyAsync();
                if (hasInstallmentAllocations)
                {
                    throw new ArgumentException("No se puede eliminar una transacción cargada a crédito con pagos aplicados");
                }
            }

            var paymentResult = await _creditLifecycleService.ReverseCreditPaymentSourceAsync(id);
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
            var result = await _repository.RemoveAsync(transaction);
            return result == 1;
        }

        private async Task UpdateAccountBalanceAsync(int accountId, decimal amount)
        {
            var updated = await _repository.UpdateAccountBalanceAsync(accountId, amount, amount < 0);
            if (!updated)
            {
                throw new ArgumentException(amount < 0
                    ? "Saldo insuficiente en la cuenta"
                    : $"Account with ID {accountId} not found");
            }
        }
    }
}
