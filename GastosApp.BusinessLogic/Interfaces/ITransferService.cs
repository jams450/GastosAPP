namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITransferService
    {
        Task<(bool Success, string? ErrorMessage)> CreateTransferAsync(
            int sourceAccountId,
            int destinationAccountId,
            decimal amount,
            string? description = null,
            DateTime? transactionDate = null,
            int? categoryId = null,
            int? subcategoryId = null,
            int? merchantId = null,
            IEnumerable<string>? tags = null);

        Task<bool> DeleteTransferAsync(Guid transferGroupId);

        Task<(bool Success, string? ErrorMessage)> UpdateTransferMetadataAsync(
            Guid transferGroupId,
            int userId,
            int? categoryId,
            int? subcategoryId,
            int? merchantId,
            string? description,
            DateTime? transactionDate,
            IEnumerable<string>? tags);
    }
}
