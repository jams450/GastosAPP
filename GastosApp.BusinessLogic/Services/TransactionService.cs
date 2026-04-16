using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class TransactionService : ITransactionService
    {
        private readonly IRepository _repository;
        private readonly IAccountService _accountService;
        private readonly ITagService _tagService;

        public TransactionService(IRepository repository, IAccountService accountService, ITagService tagService)
        {
            _repository = repository;
            _accountService = accountService;
            _tagService = tagService;
        }

        public async Task<Transaction?> GetByIdAsync(int id)
        {
            return await _repository.Get<Transaction>(t => t.TransactionId == id)
                .Include(t => t.TransactionTags)
                .ThenInclude(tt => tt.Tag)
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Transaction>> GetAllByAccountIdAsync(int accountId)
        {
            return await _repository.Get<Transaction>(t => t.AccountId == accountId)
                .Include(t => t.TransactionTags)
                .ThenInclude(tt => tt.Tag)
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
                .OrderByDescending(t => t.TransactionDate)
                .ToListAsync();
        }

        public async Task<IEnumerable<Transaction>> GetByCategoryAsync(int categoryId)
        {
            return await _repository.Get<Transaction>(t => t.CategoryId == categoryId)
                .Include(t => t.TransactionTags)
                .ThenInclude(tt => tt.Tag)
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

        public async Task<Transaction> CreateExpenseAsync(Transaction transaction)
        {
            transaction.Type = "expense";
            transaction.BalanceImpact = transaction.Amount * -1;
            transaction.Direction = "debit";
            transaction.CounterpartyAccountId = null;
            transaction.Created = DateTime.UtcNow;
            
            var result = await _repository.Save<Transaction>(transaction);
            
            // Actualizar saldo de la cuenta (restar)
            await _accountService.UpdateBalanceAsync(transaction.AccountId, -transaction.Amount);
            
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
            var date = transactionDate ?? DateTime.UtcNow;

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
                TransactionDate = DateTime.SpecifyKind(date, DateTimeKind.Utc),
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
                TransactionDate = DateTime.SpecifyKind(date, DateTimeKind.Utc),
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
                    transaction.TransactionDate = DateTime.SpecifyKind(transactionDate.Value, DateTimeKind.Utc);
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
    }
}
