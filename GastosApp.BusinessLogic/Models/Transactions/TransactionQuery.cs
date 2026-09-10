using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Models.Transactions;

public class TransactionQuery
{
    public int Page { get; set; }
    public int PageSize { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public int? MerchantId { get; set; }
    public string? Type { get; set; }
}

public class PagedTransactions
{
    public int TotalCount { get; set; }
    public IReadOnlyList<Transaction> Items { get; set; } = [];
}
