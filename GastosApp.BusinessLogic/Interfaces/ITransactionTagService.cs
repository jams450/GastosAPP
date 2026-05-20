namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITransactionTagService
    {
        Task SyncTransactionTagsAsync(int transactionId, int userId, IEnumerable<string>? tagNames);
    }
}
