using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using GastosApp.BusinessLogic.Models.Transactions;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class TransactionService : ITransactionService
    {
        private readonly IRepository _repository;
        private readonly IAccountService _accountService;
        private readonly ITagService _tagService;
        private readonly IBillablePartyService _billablePartyService;

        public TransactionService(IRepository repository, IAccountService accountService, ITagService tagService, IBillablePartyService billablePartyService)
        {
            _repository = repository;
            _accountService = accountService;
            _tagService = tagService;
            _billablePartyService = billablePartyService;
        }

        public async Task<Transaction?> GetByIdAsync(int id)
        {
            return await _repository.Get<Transaction>(t => t.TransactionId == id)
                .Include(t => t.TransactionTags)
                .ThenInclude(tt => tt.Tag)
                .Include(t => t.TransactionAllocations)
                .ThenInclude(a => a.BillableParty)
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Transaction>> GetAllByAccountIdAsync(int accountId)
        {
            return await _repository.Get<Transaction>(t => t.AccountId == accountId)
                .Include(t => t.TransactionTags)
                .ThenInclude(tt => tt.Tag)
                .Include(t => t.TransactionAllocations)
                .ThenInclude(a => a.BillableParty)
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<IEnumerable<Transaction>> GetByDateRangeAsync(int accountId, DateTime startDate, DateTime endDate)
        {
            return await _repository.Get<Transaction>(t => 
                t.AccountId == accountId && 
                t.TransactionDate >= startDate && 
                t.TransactionDate <= endDate)
                .Include(t => t.TransactionTags)
                .ThenInclude(tt => tt.Tag)
                .Include(t => t.TransactionAllocations)
                .ThenInclude(a => a.BillableParty)
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<IEnumerable<Transaction>> GetByCategoryAsync(int categoryId)
        {
            return await _repository.Get<Transaction>(t => t.CategoryId == categoryId)
                .Include(t => t.TransactionTags)
                .ThenInclude(tt => tt.Tag)
                .Include(t => t.TransactionAllocations)
                .ThenInclude(a => a.BillableParty)
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<Transaction> CreateIncomeAsync(Transaction transaction)
        {
            transaction.Type = "income";
            transaction.BalanceImpact = transaction.Amount;
            transaction.Direction = "credit";
            transaction.CounterpartyAccountId = null;
            transaction.Created = DateTime.UtcNow;
            
            var result = await _repository.Save<Transaction>(transaction);
            
            // Actualizar saldo de la cuenta
            await _accountService.UpdateBalanceAsync(transaction.AccountId, transaction.Amount);
            
            return result;
        }

        public async Task<Transaction> CreateExpenseAsync(Transaction transaction, int userId, IEnumerable<ExpenseAllocationInput>? allocations = null)
        {
            transaction.Type = "expense";
            transaction.BalanceImpact = transaction.Amount * -1;
            transaction.Direction = "debit";
            transaction.CounterpartyAccountId = null;
            transaction.Created = DateTime.UtcNow;
            
            var result = await _repository.Save<Transaction>(transaction);

            var allocationResult = await ReplaceExpenseAllocationsAsync(result.TransactionId, userId, allocations, fallbackToSelfWhenEmpty: true);
            if (!allocationResult.Success)
            {
                throw new ArgumentException(allocationResult.ErrorMessage ?? "Invalid expense allocation");
            }
            
            // Actualizar saldo de la cuenta (restar)
            await _accountService.UpdateBalanceAsync(transaction.AccountId, -transaction.Amount);

            var account = await _accountService.GetByIdAsync(transaction.AccountId);
            if (account?.IsCredit == true)
            {
                await CreateCreditChargeWithPlanAsync(result, 1, "Revolving");
            }
            
            return result;
        }

        public async Task<(bool Success, string? ErrorMessage)> CreateTransferAsync(
            int sourceAccountId, 
            int destinationAccountId, 
            decimal amount, 
            string? description = null,
            DateTime? transactionDate = null,
            int? categoryId = null,
            int? subcategoryId = null,
            int? merchantId = null,
            IEnumerable<string>? tags = null)
        {
            if (amount <= 0)
                return (false, "El monto debe ser mayor a cero");

            if (sourceAccountId == destinationAccountId)
                return (false, "Las cuentas de origen y destino deben ser diferentes");

            var sourceAccount = await _accountService.GetByIdAsync(sourceAccountId);
            if (sourceAccount == null)
                return (false, "Cuenta de origen no encontrada");

            var destinationAccount = await _accountService.GetByIdAsync(destinationAccountId);
            if (destinationAccount == null)
                return (false, "Cuenta de destino no encontrada");

            if (sourceAccount.CurrentBalance < amount)
                return (false, "Saldo insuficiente en la cuenta de origen");

            var transferGroupId = Guid.NewGuid();
            var date = EnsureUtc(transactionDate ?? DateTime.UtcNow);

            // Crear transacción de salida (origen)
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
                TransactionDate = date,
                Created = DateTime.UtcNow
            };

            // Crear transacción de entrada (destino)
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
                TransactionDate = date,
                Created = DateTime.UtcNow
            };

            // Guardar ambas transacciones
            var createdSource = await _repository.Save<Transaction>(sourceTransaction);
            var createdDestination = await _repository.Save<Transaction>(destinationTransaction);

            await SyncTransactionTagsAsync(createdSource.TransactionId, sourceAccount.UserId, tags);
            await SyncTransactionTagsAsync(createdDestination.TransactionId, destinationAccount.UserId, tags);

            // Actualizar saldos
            await _accountService.UpdateBalanceAsync(sourceAccountId, -amount);
            await _accountService.UpdateBalanceAsync(destinationAccountId, amount);

            return (true, null);
        }

        public async Task<(bool IsValid, string? ErrorMessage)> ValidateAnalyticsDimensionsAsync(
            int userId,
            int? categoryId,
            int? subcategoryId,
            int? merchantId)
        {
            Category? category = null;

            if (categoryId.HasValue)
            {
                category = await _repository.Get<Category>(c => c.CategoryId == categoryId.Value && (c.UserId == userId || c.UserId == null))
                    .FirstOrDefaultAsync();

                if (category == null)
                {
                    return (false, $"Category with ID {categoryId.Value} not found");
                }
            }

            if (subcategoryId.HasValue)
            {
                var subcategory = await _repository.Get<Subcategory>(s => s.SubcategoryId == subcategoryId.Value && (s.UserId == userId || s.UserId == null))
                    .FirstOrDefaultAsync();

                if (subcategory == null)
                {
                    return (false, $"Subcategory with ID {subcategoryId.Value} not found");
                }

                if (categoryId.HasValue && subcategory.CategoryId != categoryId.Value)
                {
                    return (false, "Subcategory does not belong to the selected category");
                }

                if (!categoryId.HasValue)
                {
                    return (false, "CategoryId is required when SubcategoryId is provided");
                }
            }

            if (merchantId.HasValue)
            {
                var merchant = await _repository.Get<Merchant>(m => m.MerchantId == merchantId.Value && (m.UserId == userId || m.UserId == null))
                    .FirstOrDefaultAsync();

                if (merchant == null)
                {
                    return (false, $"Merchant with ID {merchantId.Value} not found");
                }
            }

            return (true, null);
        }

        public async Task SyncTransactionTagsAsync(int transactionId, int userId, IEnumerable<string>? tagNames)
        {
            var transaction = await _repository.GetByIdAsync<Transaction>(transactionId);
            if (transaction == null)
            {
                return;
            }

            var tags = await _tagService.ResolveOrCreateAsync(userId, tagNames);
            var desiredTagIds = tags.Select(t => t.TagId).ToHashSet();

            var existing = await _repository.Get<TransactionTag>(tt => tt.TransactionId == transactionId).ToListAsync();
            var existingTagIds = existing.Select(tt => tt.TagId).ToHashSet();

            var toRemove = existing.Where(tt => !desiredTagIds.Contains(tt.TagId)).ToList();
            if (toRemove.Count > 0)
            {
                await _repository.RemoveRangeAsync(toRemove);
            }

            foreach (var tagId in desiredTagIds.Where(id => !existingTagIds.Contains(id)))
            {
                await _repository.Save(new TransactionTag
                {
                    TransactionId = transactionId,
                    TagId = tagId
                });
            }
        }

        public async Task<(bool Success, string? ErrorMessage)> ReplaceExpenseAllocationsAsync(int transactionId, int userId, IEnumerable<ExpenseAllocationInput>? allocations, bool fallbackToSelfWhenEmpty = true)
        {
            var transaction = await _repository.GetByIdAsync<Transaction>(transactionId);
            if (transaction == null)
            {
                return (false, "Transaction not found");
            }

            if (!string.Equals(transaction.Type, "expense", StringComparison.OrdinalIgnoreCase))
            {
                return (true, null);
            }

            var normalizedInputs = (allocations ?? [])
                .Where(a => a != null && a.BillablePartyId > 0 && a.Value > 0)
                .Select(a => new ExpenseAllocationInput
                {
                    BillablePartyId = a.BillablePartyId,
                    Type = (a.Type ?? string.Empty).Trim().ToLowerInvariant(),
                    Value = a.Value
                })
                .ToList();

            if (normalizedInputs.Count == 0)
            {
                if (!fallbackToSelfWhenEmpty)
                {
                    return (true, null);
                }

                var selfParty = await _billablePartyService.EnsureSelfPartyAsync(userId);
                normalizedInputs = [new ExpenseAllocationInput { BillablePartyId = selfParty.BillablePartyId, Type = "percentage", Value = 100m }];
            }

            var duplicateBillablePartyId = normalizedInputs
                .GroupBy(a => a.BillablePartyId)
                .Where(g => g.Count() > 1)
                .Select(g => (int?)g.Key)
                .FirstOrDefault();

            if (duplicateBillablePartyId.HasValue)
            {
                return (false, $"Duplicate billable party in allocation: {duplicateBillablePartyId.Value}");
            }

            var billablePartyIds = normalizedInputs.Select(a => a.BillablePartyId).Distinct().ToList();
            var billableParties = await _repository.Get<BillableParty>(p => billablePartyIds.Contains(p.BillablePartyId) && p.OwnerUserId == userId && p.Active)
                .ToListAsync();

            if (billableParties.Count != billablePartyIds.Count)
            {
                return (false, "One or more billable parties are invalid for this user");
            }

            var hasPercentage = normalizedInputs.Any(a => a.Type == "percentage");
            var hasAmount = normalizedInputs.Any(a => a.Type == "amount");
            if (hasPercentage && hasAmount)
            {
                return (false, "Allocations cannot mix percentage and amount modes");
            }

            if (!hasPercentage && !hasAmount)
            {
                return (false, "Allocation type must be percentage or amount");
            }

            var computedAmounts = new List<decimal>();
            if (hasPercentage)
            {
                var totalPercent = normalizedInputs.Sum(a => a.Value);
                if (Math.Abs(totalPercent - 100m) > 0.0001m)
                {
                    return (false, "Percentage allocations must sum exactly 100");
                }

                decimal accumulated = 0m;
                for (var i = 0; i < normalizedInputs.Count; i++)
                {
                    var isLast = i == normalizedInputs.Count - 1;
                    var amount = isLast
                        ? Math.Round(transaction.Amount - accumulated, 2, MidpointRounding.AwayFromZero)
                        : Math.Round(transaction.Amount * (normalizedInputs[i].Value / 100m), 2, MidpointRounding.AwayFromZero);
                    computedAmounts.Add(amount);
                    accumulated += amount;
                }
            }
            else
            {
                var totalAmount = normalizedInputs.Sum(a => a.Value);
                if (Math.Abs(totalAmount - transaction.Amount) > 0.01m)
                {
                    return (false, "Amount allocations must sum exactly transaction amount");
                }

                computedAmounts.AddRange(normalizedInputs.Select(a => Math.Round(a.Value, 2, MidpointRounding.AwayFromZero)));
            }

            var existing = await _repository.Get<TransactionAllocation>(a => a.TransactionId == transactionId).ToListAsync();
            if (existing.Count > 0)
            {
                await _repository.RemoveRangeAsync(existing);
            }

            for (var i = 0; i < normalizedInputs.Count; i++)
            {
                var input = normalizedInputs[i];
                var party = billableParties.First(p => p.BillablePartyId == input.BillablePartyId);
                await _repository.Save(new TransactionAllocation
                {
                    TransactionId = transactionId,
                    BillablePartyId = input.BillablePartyId,
                    AllocationMode = hasPercentage ? "percentage" : "amount",
                    AllocationValue = input.Value,
                    CalculatedAmount = computedAmounts[i],
                    BillablePartySnapshotName = party.DisplayName,
                    Created = DateTime.UtcNow
                });
            }

            return (true, null);
        }

        public async Task<Transaction?> UpdateAsync(int id, Transaction transaction)
        {
            var existing = await _repository.GetByIdAsync<Transaction>(id);
            if (existing == null) return null;

            var previousImpact = existing.BalanceImpact;
            if (previousImpact == 0)
            {
                previousImpact = await InferLegacyBalanceImpactAsync(existing);
            }

            transaction.BalanceImpact = ResolveUpdatedBalanceImpact(transaction, previousImpact);
            transaction.Direction = ResolveDirection(transaction.BalanceImpact);
            if (transaction.Type != "transfer")
            {
                transaction.CounterpartyAccountId = null;
            }
            
            transaction.TransactionId = id;
            transaction.Updated = DateTime.UtcNow;
            
            var result = await _repository.SaveUpdate<Transaction>(id, transaction);
            
            var adjustment = transaction.BalanceImpact - previousImpact;
            if (adjustment != 0)
            {
                await _accountService.UpdateBalanceAsync(existing.AccountId, adjustment);
            }

            if (transaction.Type == "expense")
            {
                await SynchronizeCreditChargePlanAsync(id, transaction.Amount, transaction.TransactionDate);
            }
            
            return result;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var transaction = await _repository.GetByIdAsync<Transaction>(id);
            if (transaction == null) return false;

            // Revertir el efecto en el saldo antes de eliminar
            var balanceImpact = transaction.BalanceImpact;
            if (balanceImpact == 0)
            {
                balanceImpact = await InferLegacyBalanceImpactAsync(transaction);
            }

            var balanceAdjustment = balanceImpact * -1;
            await _accountService.UpdateBalanceAsync(transaction.AccountId, balanceAdjustment);

            var result = await _repository.DeleteModel<Transaction>(id);
            return result > 0;
        }

        public async Task<bool> DeleteTransferAsync(Guid transferGroupId)
        {
            var transactions = await _repository.Get<Transaction>(t => t.TransferGroupId == transferGroupId).ToListAsync();
            
            if (transactions.Count != 2)
                return false;

            // Revertir saldos
            foreach (var transaction in transactions)
            {
                var balanceImpact = transaction.BalanceImpact;
                if (balanceImpact == 0)
                {
                    balanceImpact = await InferLegacyBalanceImpactAsync(transaction);
                }

                var balanceAdjustment = balanceImpact * -1;
                
                await _accountService.UpdateBalanceAsync(transaction.AccountId, balanceAdjustment);
            }

            // Eliminar transacciones
            await _repository.RemoveRangeAsync(transactions);
            return true;
        }

        public async Task<(bool Success, string? ErrorMessage)> UpdateTransferMetadataAsync(
            Guid transferGroupId,
            int userId,
            int? categoryId,
            int? subcategoryId,
            int? merchantId,
            string? description,
            DateTime? transactionDate,
            IEnumerable<string>? tags)
        {
            var transactions = await _repository.GetTrack<Transaction>()
                .Where(t => t.TransferGroupId == transferGroupId)
                .ToListAsync();
            if (transactions.Count != 2)
            {
                return (false, "Transfer not found");
            }

            var ownerChecks = await Task.WhenAll(transactions.Select(t => _accountService.GetByIdAsync(t.AccountId)));
            if (ownerChecks.Any(a => a == null || a.UserId != userId))
            {
                return (false, "Transfer not found");
            }

            var sample = transactions[0];
            var effectiveCategoryId = categoryId ?? sample.CategoryId;
            var effectiveSubcategoryId = subcategoryId ?? sample.SubcategoryId;
            var effectiveMerchantId = merchantId ?? sample.MerchantId;

            var dimensionsValidation = await ValidateAnalyticsDimensionsAsync(
                userId,
                effectiveCategoryId,
                effectiveSubcategoryId,
                effectiveMerchantId);

            if (!dimensionsValidation.IsValid)
            {
                return (false, dimensionsValidation.ErrorMessage);
            }

            foreach (var transaction in transactions)
            {
                if (categoryId.HasValue)
                {
                    transaction.CategoryId = categoryId.Value;
                }

                if (subcategoryId.HasValue)
                {
                    transaction.SubcategoryId = subcategoryId.Value;
                }

                if (merchantId.HasValue)
                {
                    transaction.MerchantId = merchantId.Value;
                }

                if (description != null)
                {
                    transaction.Description = description;
                }

                if (transactionDate.HasValue)
                {
                    transaction.TransactionDate = EnsureUtc(transactionDate.Value);
                }

                transaction.Updated = DateTime.UtcNow;
            }

            await _repository.SaveChangesAsync();

            foreach (var transaction in transactions)
            {
                await SyncTransactionTagsAsync(transaction.TransactionId, userId, tags);
            }

            return (true, null);
        }

        public async Task<decimal> CalculateAccountBalanceAsync(int accountId)
        {
            var transactions = await _repository.Get<Transaction>(t => t.AccountId == accountId).ToListAsync();
            return transactions.Sum(t => t.BalanceImpact);
        }

        public async Task<(bool Success, string? ErrorMessage)> RegisterCreditPaymentAsync(
            int creditAccountId,
            int sourceTransactionId,
            DateTime paidAt,
            decimal amount,
            IEnumerable<(int InstallmentId, decimal Amount)> allocations)
        {
            if (amount <= 0)
            {
                return (false, "El monto del pago debe ser mayor a cero");
            }

            var allocationList = allocations
                .Where(a => a.InstallmentId > 0 && a.Amount > 0)
                .ToList();

            if (allocationList.Count == 0)
            {
                return (false, "Debes asignar al menos una mensualidad");
            }

            var allocationTotal = allocationList.Sum(a => a.Amount);
            if (allocationTotal != amount)
            {
                return (false, "La suma de asignaciones debe coincidir con monto del pago");
            }

            var account = await _accountService.GetByIdAsync(creditAccountId);
            if (account == null || !account.IsCredit)
            {
                return (false, "La cuenta destino no es de crédito");
            }

            var sourceTransaction = await _repository.Get<Transaction>(t => t.TransactionId == sourceTransactionId)
                .FirstOrDefaultAsync();
            if (sourceTransaction == null)
            {
                return (false, "No existe transacción origen para aplicar pago de crédito");
            }

            var existingPayment = await _repository.GetTrack<CreditPayment>()
                .FirstOrDefaultAsync(p => p.SourceTransactionId == sourceTransactionId);

            var maxAllowedFromSource = sourceTransaction.Amount;
            if (existingPayment != null && existingPayment.Amount + amount > maxAllowedFromSource)
            {
                return (false, "La aplicación excede monto disponible de transacción origen");
            }

            if (existingPayment == null && amount > maxAllowedFromSource)
            {
                return (false, "La aplicación excede monto disponible de transacción origen");
            }

            var installmentIds = allocationList.Select(a => a.InstallmentId).Distinct().ToList();
            var installments = await _repository.GetTrack<CreditInstallment>()
                .Include(i => i.Plan)
                .Where(i => installmentIds.Contains(i.InstallmentId))
                .ToListAsync();

            if (installments.Count != installmentIds.Count)
            {
                return (false, "Hay mensualidades inválidas en la asignación");
            }

            if (installments.Any(i => i.Plan.AccountId != creditAccountId))
            {
                return (false, "Todas las mensualidades deben pertenecer a la misma cuenta crédito");
            }

            var installmentPaidRows = await _repository.Get<InstallmentAllocation>(a => installmentIds.Contains(a.InstallmentId))
                .GroupBy(a => a.InstallmentId)
                .Select(g => new { InstallmentId = g.Key, Paid = g.Sum(x => x.AllocatedAmount) })
                .ToListAsync();
            var paidByInstallment = installmentPaidRows.ToDictionary(x => x.InstallmentId, x => x.Paid);

            foreach (var allocation in allocationList)
            {
                var installment = installments.First(i => i.InstallmentId == allocation.InstallmentId);
                var paidAmount = paidByInstallment.TryGetValue(installment.InstallmentId, out var currentPaid) ? currentPaid : 0m;
                var remaining = installment.TotalDue - paidAmount;
                if (allocation.Amount > remaining)
                {
                    return (false, $"La asignación excede saldo pendiente en mensualidad {installment.InstallmentNumber}");
                }
            }

            CreditPayment creditPayment;
            if (existingPayment == null)
            {
                creditPayment = await _repository.Save(new CreditPayment
                {
                    AccountId = creditAccountId,
                    SourceTransactionId = sourceTransactionId,
                    PaidAt = EnsureUtc(paidAt),
                    Amount = amount,
                    Status = "Posted",
                    Created = DateTime.UtcNow
                });
            }
            else
            {
                existingPayment.Amount += amount;
                existingPayment.Updated = DateTime.UtcNow;
                creditPayment = existingPayment;
            }

            foreach (var allocation in allocationList)
            {
                await _repository.Save(new InstallmentAllocation
                {
                    PaymentId = creditPayment.PaymentId,
                    InstallmentId = allocation.InstallmentId,
                    AllocatedAmount = allocation.Amount,
                    Created = DateTime.UtcNow
                });
            }

            await RecalculateInstallmentStatusesAsync(installmentIds);
            return (true, null);
        }

        public async Task<(bool Success, string? ErrorMessage)> ConvertChargeToMsiAsync(int sourceTransactionId, int months)
        {
            if (months <= 1)
            {
                return (false, "Meses MSI debe ser mayor a 1");
            }

            var charge = await _repository.GetTrack<CreditCharge>()
                .Include(c => c.InstallmentPlan)
                .ThenInclude(p => p!.Installments)
                .FirstOrDefaultAsync(c => c.SourceTransactionId == sourceTransactionId);

            if (charge == null)
            {
                return (false, "No existe cargo de crédito para esa transacción");
            }

            if (charge.InstallmentPlan == null)
            {
                return (false, "Cargo sin plan de pagos");
            }

            var plan = charge.InstallmentPlan;
            var hasPayments = await _repository.Get<InstallmentAllocation>(a => plan.Installments.Select(i => i.InstallmentId).Contains(a.InstallmentId))
                .AnyAsync();
            if (hasPayments)
            {
                return (false, "No se puede convertir a MSI un cargo con pagos ya asignados");
            }

            var oldInstallments = plan.Installments.ToList();
            if (oldInstallments.Count > 0)
            {
                await _repository.RemoveRangeAsync(oldInstallments);
            }

            plan.PlanType = "MSI";
            plan.Months = months;
            plan.MonthlyAmountBase = Math.Round(charge.PrincipalAmount / months, 2, MidpointRounding.AwayFromZero);
            plan.RoundingResidual = charge.PrincipalAmount - (plan.MonthlyAmountBase * months);
            plan.Updated = DateTime.UtcNow;

            var dueDateBase = charge.OccurredAt.Date;
            for (var installmentNumber = 1; installmentNumber <= months; installmentNumber++)
            {
                var totalDue = plan.MonthlyAmountBase;
                if (installmentNumber == months)
                {
                    totalDue += plan.RoundingResidual;
                }

                await _repository.Save(new CreditInstallment
                {
                    PlanId = plan.PlanId,
                    InstallmentNumber = installmentNumber,
                    DueDate = EnsureUtc(dueDateBase.AddMonths(installmentNumber)),
                    PrincipalDue = totalDue,
                    InterestDue = 0m,
                    FeeDue = 0m,
                    TotalDue = totalDue,
                    Status = "Open",
                    Created = DateTime.UtcNow
                });
            }

            await _repository.SaveChangesAsync();
            return (true, null);
        }

        public async Task<IEnumerable<CreditInstallmentOpenItem>> GetOpenCreditInstallmentsAsync(int creditAccountId)
        {
            var rows = await _repository.Get<CreditInstallment>()
                .Include(i => i.Plan)
                .ThenInclude(p => p.SourceCharge)
                .ThenInclude(c => c.SourceTransaction)
                .Where(i => i.Plan.AccountId == creditAccountId && i.Status != "Paid")
                .OrderBy(i => i.DueDate)
                .ToListAsync();

            if (rows.Count == 0)
            {
                return [];
            }

            var installmentIds = rows.Select(i => i.InstallmentId).ToList();
            var paidRows = await _repository.Get<InstallmentAllocation>(a => installmentIds.Contains(a.InstallmentId))
                .GroupBy(a => a.InstallmentId)
                .Select(g => new { InstallmentId = g.Key, Paid = g.Sum(x => x.AllocatedAmount) })
                .ToListAsync();
            var paidByInstallment = paidRows.ToDictionary(x => x.InstallmentId, x => x.Paid);

            return rows
                .Select(row =>
                {
                    var paid = paidByInstallment.TryGetValue(row.InstallmentId, out var value) ? value : 0m;
                    return new CreditInstallmentOpenItem
                    {
                        InstallmentId = row.InstallmentId,
                        PlanId = row.PlanId,
                        PlanType = row.Plan.PlanType,
                        InstallmentNumber = row.InstallmentNumber,
                        Months = row.Plan.Months,
                        DueDate = row.DueDate,
                        TotalDue = row.TotalDue,
                        PaidAmount = paid,
                        RemainingAmount = Math.Max(row.TotalDue - paid, 0m),
                        SourceTransactionId = row.Plan.SourceCharge.SourceTransactionId,
                        Description = row.Plan.SourceCharge.SourceTransaction.Description ?? string.Empty
                    };
                })
                .Where(x => x.RemainingAmount > 0)
                .ToList();
        }

        public async Task<(bool Success, string? ErrorMessage, int CreatedCount)> CreateOpeningCreditChargesAsync(
            int creditAccountId,
            IEnumerable<OpeningCreditChargeInput> items)
        {
            var account = await _accountService.GetByIdAsync(creditAccountId);
            if (account == null || !account.IsCredit)
            {
                return (false, "La cuenta indicada no es de crédito", 0);
            }

            var normalized = items
                .Where(i => i.Amount > 0 && i.CategoryId > 0)
                .Select(i => new OpeningCreditChargeInput
                {
                    CategoryId = i.CategoryId,
                    Amount = decimal.Round(i.Amount, 2, MidpointRounding.AwayFromZero),
                    Months = i.Months <= 0 ? 1 : i.Months,
                    Description = string.IsNullOrWhiteSpace(i.Description) ? "Saldo inicial heredado" : i.Description!.Trim(),
                    OccurredAt = i.OccurredAt
                })
                .ToList();

            if (normalized.Count == 0)
            {
                return (false, "Debes enviar al menos un cargo con monto mayor a cero", 0);
            }

            foreach (var input in normalized)
            {
                if (input.Months < 1 || input.Months > 60)
                {
                    return (false, "Meses inválido. Debe estar entre 1 y 60", 0);
                }

                var occurredAt = EnsureUtc(input.OccurredAt ?? DateTime.UtcNow);
                var syntheticTransaction = await _repository.Save(new Transaction
                {
                    AccountId = creditAccountId,
                    CategoryId = input.CategoryId,
                    Type = "opening_credit",
                    Amount = input.Amount,
                    BalanceImpact = 0m,
                    Direction = "credit",
                    Description = input.Description,
                    TransactionDate = occurredAt,
                    Created = DateTime.UtcNow
                });

                await CreateCreditChargeWithPlanAsync(
                    syntheticTransaction,
                    input.Months,
                    input.Months > 1 ? "MSI" : "Revolving");
            }

            return (true, null, normalized.Count);
        }

        public async Task<IEnumerable<CreditChargeSummaryItem>> GetCreditChargeSummariesAsync(IEnumerable<int> sourceTransactionIds)
        {
            var ids = sourceTransactionIds.Distinct().ToList();
            if (ids.Count == 0)
            {
                return [];
            }

            var plans = await _repository.Get<CreditInstallmentPlan>()
                .Include(p => p.SourceCharge)
                .Include(p => p.Installments)
                .Where(p => ids.Contains(p.SourceCharge.SourceTransactionId))
                .ToListAsync();

            if (plans.Count == 0)
            {
                return [];
            }

            var installmentIds = plans.SelectMany(p => p.Installments).Select(i => i.InstallmentId).Distinct().ToList();
            var paidByInstallment = installmentIds.Count == 0
                ? new Dictionary<int, decimal>()
                : await _repository.Get<InstallmentAllocation>(a => installmentIds.Contains(a.InstallmentId))
                    .GroupBy(a => a.InstallmentId)
                    .Select(g => new { InstallmentId = g.Key, Paid = g.Sum(x => x.AllocatedAmount) })
                    .ToDictionaryAsync(x => x.InstallmentId, x => x.Paid);

            return plans
                .Select(plan =>
                {
                    var totalDue = plan.Installments.Sum(i => i.TotalDue);
                    var paidTotal = plan.Installments.Sum(i => paidByInstallment.TryGetValue(i.InstallmentId, out var value) ? value : 0m);
                    return new CreditChargeSummaryItem
                    {
                        SourceTransactionId = plan.SourceCharge.SourceTransactionId,
                        Months = Math.Max(plan.Months, 1),
                        RemainingAmount = Math.Max(totalDue - paidTotal, 0m),
                        Status = plan.SourceCharge.Status
                    };
                })
                .ToList();
        }

        private static decimal ResolveUpdatedBalanceImpact(Transaction transaction, decimal previousImpact)
        {
            return transaction.Type.ToLower() switch
            {
                "income" => transaction.Amount,
                "expense" => transaction.Amount * -1,
                "transfer" => previousImpact < 0 ? transaction.Amount * -1 : transaction.Amount,
                _ => previousImpact
            };
        }

        private static DateTime EnsureUtc(DateTime value)
        {
            return value.Kind switch
            {
                DateTimeKind.Utc => value,
                DateTimeKind.Local => value.ToUniversalTime(),
                _ => DateTime.SpecifyKind(value, DateTimeKind.Local).ToUniversalTime()
            };
        }

        private static string ResolveDirection(decimal balanceImpact)
        {
            return balanceImpact < 0 ? "debit" : "credit";
        }

        private async Task<decimal> InferLegacyBalanceImpactAsync(Transaction transaction)
        {
            switch (transaction.Type.ToLower())
            {
                case "income":
                    return transaction.Amount;
                case "expense":
                    return transaction.Amount * -1;
                case "transfer":
                    if (!transaction.TransferGroupId.HasValue)
                    {
                        return transaction.Amount;
                    }

                    var ordered = await _repository.Get<Transaction>(t => t.TransferGroupId == transaction.TransferGroupId)
                        .OrderBy(t => t.TransactionId)
                        .Select(t => t.TransactionId)
                        .ToListAsync();

                    if (ordered.Count < 2)
                    {
                        return transaction.Amount;
                    }

                    return transaction.TransactionId == ordered[0]
                        ? transaction.Amount * -1
                        : transaction.Amount;
                default:
                    return transaction.Amount;
            }
        }

        private async Task CreateCreditChargeWithPlanAsync(Transaction transaction, int months, string planType)
        {
            var charge = await _repository.Save(new CreditCharge
            {
                AccountId = transaction.AccountId,
                SourceTransactionId = transaction.TransactionId,
                OccurredAt = transaction.TransactionDate,
                PrincipalAmount = transaction.Amount,
                Status = "Open",
                Created = DateTime.UtcNow
            });

            var monthlyAmountBase = Math.Round(transaction.Amount / months, 2, MidpointRounding.AwayFromZero);
            var roundingResidual = transaction.Amount - (monthlyAmountBase * months);

            var plan = await _repository.Save(new CreditInstallmentPlan
            {
                AccountId = transaction.AccountId,
                SourceChargeId = charge.ChargeId,
                PlanType = planType,
                Months = months,
                PrincipalAmount = transaction.Amount,
                MonthlyAmountBase = monthlyAmountBase,
                RoundingResidual = roundingResidual,
                Status = "Active",
                Created = DateTime.UtcNow
            });

            for (var installmentNumber = 1; installmentNumber <= months; installmentNumber++)
            {
                var totalDue = monthlyAmountBase;
                if (installmentNumber == months)
                {
                    totalDue += roundingResidual;
                }

                await _repository.Save(new CreditInstallment
                {
                    PlanId = plan.PlanId,
                    InstallmentNumber = installmentNumber,
                    DueDate = EnsureUtc(transaction.TransactionDate.Date.AddMonths(installmentNumber)),
                    PrincipalDue = totalDue,
                    InterestDue = 0m,
                    FeeDue = 0m,
                    TotalDue = totalDue,
                    Status = "Open",
                    Created = DateTime.UtcNow
                });
            }
        }

        private async Task RecalculateInstallmentStatusesAsync(IEnumerable<int> installmentIds)
        {
            var ids = installmentIds.Distinct().ToList();
            if (ids.Count == 0)
            {
                return;
            }

            var installments = await _repository.GetTrack<CreditInstallment>()
                .Where(i => ids.Contains(i.InstallmentId))
                .ToListAsync();

            var paidRows = await _repository.Get<InstallmentAllocation>(a => ids.Contains(a.InstallmentId))
                .GroupBy(a => a.InstallmentId)
                .Select(g => new { InstallmentId = g.Key, Paid = g.Sum(x => x.AllocatedAmount) })
                .ToListAsync();
            var paidByInstallment = paidRows.ToDictionary(x => x.InstallmentId, x => x.Paid);

            foreach (var installment in installments)
            {
                var paid = paidByInstallment.TryGetValue(installment.InstallmentId, out var value) ? value : 0m;
                installment.Status = paid switch
                {
                    <= 0m => "Open",
                    _ when paid >= installment.TotalDue => "Paid",
                    _ => "PartiallyPaid"
                };
                installment.Updated = DateTime.UtcNow;
            }

            await _repository.SaveChangesAsync();

            var planIds = installments.Select(i => i.PlanId).Distinct().ToList();
            var plans = await _repository.GetTrack<CreditInstallmentPlan>()
                .Include(p => p.Installments)
                .Include(p => p.SourceCharge)
                .Where(p => planIds.Contains(p.PlanId))
                .ToListAsync();

            foreach (var plan in plans)
            {
                var allPaid = plan.Installments.All(i => i.Status == "Paid");
                var anyPaid = plan.Installments.Any(i => i.Status == "Paid" || i.Status == "PartiallyPaid");
                plan.Status = allPaid ? "Completed" : anyPaid ? "Active" : "Active";
                plan.Updated = DateTime.UtcNow;

                if (plan.SourceCharge != null)
                {
                    plan.SourceCharge.Status = allPaid ? "Paid" : anyPaid ? "PartiallyPaid" : "Open";
                    plan.SourceCharge.Updated = DateTime.UtcNow;
                }
            }

            await _repository.SaveChangesAsync();
        }

        private async Task SynchronizeCreditChargePlanAsync(int sourceTransactionId, decimal newAmount, DateTime newTransactionDate)
        {
            var charge = await _repository.GetTrack<CreditCharge>()
                .Include(c => c.InstallmentPlan)
                .ThenInclude(p => p!.Installments)
                .FirstOrDefaultAsync(c => c.SourceTransactionId == sourceTransactionId);

            if (charge?.InstallmentPlan == null)
            {
                return;
            }

            var plan = charge.InstallmentPlan;
            var months = Math.Max(plan.Months, 1);

            charge.PrincipalAmount = newAmount;
            charge.OccurredAt = EnsureUtc(newTransactionDate);
            charge.Updated = DateTime.UtcNow;

            var monthlyAmountBase = Math.Round(newAmount / months, 2, MidpointRounding.AwayFromZero);
            var roundingResidual = newAmount - (monthlyAmountBase * months);

            plan.PrincipalAmount = newAmount;
            plan.MonthlyAmountBase = monthlyAmountBase;
            plan.RoundingResidual = roundingResidual;
            plan.Updated = DateTime.UtcNow;

            var orderedInstallments = plan.Installments
                .OrderBy(i => i.InstallmentNumber)
                .ToList();

            if (orderedInstallments.Count != months)
            {
                return;
            }

            foreach (var installment in orderedInstallments)
            {
                var totalDue = monthlyAmountBase;
                if (installment.InstallmentNumber == months)
                {
                    totalDue += roundingResidual;
                }

                installment.DueDate = EnsureUtc(newTransactionDate.Date.AddMonths(installment.InstallmentNumber));
                installment.PrincipalDue = totalDue;
                installment.InterestDue = 0m;
                installment.FeeDue = 0m;
                installment.TotalDue = totalDue;
                installment.Updated = DateTime.UtcNow;
            }

            await _repository.SaveChangesAsync();
            await RecalculateInstallmentStatusesAsync(orderedInstallments.Select(i => i.InstallmentId));
        }
    }
}
