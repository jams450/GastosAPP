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

        public TransactionCommandService(
            IRepository repository,
            IAccountService accountService,
            IExpenseAllocationService allocationService,
            ICreditLifecycleService creditLifecycleService,
            ITransactionValidationService validation)
        {
            _repository = repository;
            _accountService = accountService;
            _allocationService = allocationService;
            _creditLifecycleService = creditLifecycleService;
            _validation = validation;
        }

        public async Task<Transaction> CreateIncomeAsync(Transaction transaction)
        {
            transaction.Type = "income";
            transaction.BalanceImpact = transaction.Amount;
            transaction.Direction = "credit";
            transaction.CounterpartyAccountId = null;

            var result = await _repository.Save(transaction);
            await UpdateAccountBalanceAsync(transaction.AccountId, transaction.Amount);
            return result;
        }

        public async Task<Transaction> CreateExpenseAsync(Transaction transaction, int userId, IEnumerable<ExpenseAllocationInput>? allocations = null)
        {
            transaction.Type = "expense";
            transaction.BalanceImpact = transaction.Amount * -1;
            transaction.Direction = "debit";
            transaction.CounterpartyAccountId = null;

            var result = await _repository.Save(transaction);
            var allocationResult = await _allocationService.ReplaceExpenseAllocationsAsync(result.TransactionId, userId, allocations, true);
            if (!allocationResult.Success)
            {
                throw new ArgumentException(allocationResult.ErrorMessage ?? "Invalid expense allocation");
            }

            await UpdateAccountBalanceAsync(transaction.AccountId, -transaction.Amount);
            var account = await _accountService.GetByIdAsync(transaction.AccountId);
            if (account?.IsCredit == true)
            {
                await _creditLifecycleService.CreateCreditChargeWithPlanAsync(result, 1, "Revolving");
            }

            return result;
        }

        public async Task<Transaction?> UpdateAsync(int id, Transaction transaction)
        {
            var existing = await _repository.GetByIdAsync<Transaction>(id);
            if (existing == null) return null;

            var previousImpact = existing.BalanceImpact;
            if (previousImpact == 0)
            {
                previousImpact = await _validation.InferLegacyBalanceImpactAsync(existing);
            }

            transaction.BalanceImpact = _validation.ResolveUpdatedBalanceImpact(transaction, previousImpact);
            transaction.Direction = _validation.ResolveDirection(transaction.BalanceImpact);
            if (transaction.Type != "transfer")
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

            if (transaction.Type == "expense")
            {
                await _creditLifecycleService.SynchronizeCreditChargePlanAsync(id, transaction.Amount, transaction.TransactionDate);
            }

            return result;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var transaction = await _repository.GetByIdAsync<Transaction>(id);
            if (transaction == null) return false;

            var balanceImpact = transaction.BalanceImpact;
            if (balanceImpact == 0)
            {
                balanceImpact = await _validation.InferLegacyBalanceImpactAsync(transaction);
            }

            await UpdateAccountBalanceAsync(transaction.AccountId, balanceImpact * -1);
            var result = await _repository.RemoveAsync<Transaction>(id);
            return result > 0;
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
