namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITransactionTagService
    {
        Task SyncTransactionTagsAsync(int transactionId, int userId, IEnumerable<string>? tagNames);
        Task SyncTransactionTagsAsync(int userId, IReadOnlyCollection<int> transactionIds, IEnumerable<string>? tagNames);
    }
}
