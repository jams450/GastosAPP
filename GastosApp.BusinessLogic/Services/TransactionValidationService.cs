using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class TransactionValidationService : ITransactionValidationService
    {
        private readonly IRepository _repository;

        public TransactionValidationService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<(bool IsValid, string? ErrorMessage)> ValidateAnalyticsDimensionsAsync(int userId, int? categoryId, int? subcategoryId, int? merchantId)
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

        public DateTime EnsureUtc(DateTime value)
        {
            return value.Kind switch
            {
                DateTimeKind.Utc => value,
                DateTimeKind.Local => value.ToUniversalTime(),
                _ => DateTime.SpecifyKind(value, DateTimeKind.Local).ToUniversalTime()
            };
        }

        public string ResolveDirection(decimal balanceImpact) => balanceImpact < 0
            ? TransactionDomainConstants.Direction.Debit
            : TransactionDomainConstants.Direction.Credit;

        public decimal ResolveUpdatedBalanceImpact(Transaction transaction, decimal previousImpact)
        {
            return transaction.Type.ToLowerInvariant() switch
            {
                TransactionDomainConstants.TransactionType.Income => transaction.Amount,
                TransactionDomainConstants.TransactionType.Expense => transaction.Amount * -1,
                TransactionDomainConstants.TransactionType.Transfer => previousImpact < 0 ? transaction.Amount * -1 : transaction.Amount,
                _ => previousImpact
            };
        }

        public async Task<decimal> InferLegacyBalanceImpactAsync(Transaction transaction)
        {
            switch (transaction.Type.ToLowerInvariant())
            {
                case TransactionDomainConstants.TransactionType.Income: return transaction.Amount;
                case TransactionDomainConstants.TransactionType.Expense: return transaction.Amount * -1;
                case TransactionDomainConstants.TransactionType.Transfer:
                    if (!transaction.TransferGroupId.HasValue) return transaction.Amount;
                    var ordered = await _repository.Get<Transaction>(t => t.TransferGroupId == transaction.TransferGroupId)
                        .OrderBy(t => t.TransactionId)
                        .Select(t => t.TransactionId)
                        .ToListAsync();
                    if (ordered.Count < 2) return transaction.Amount;
                    return transaction.TransactionId == ordered[0] ? transaction.Amount * -1 : transaction.Amount;
                default: return transaction.Amount;
            }
        }
    }
}
