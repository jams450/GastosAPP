namespace GastosApp.BusinessLogic.Models.Transactions;

public sealed class TransactionAggregateQuery
{
    public DateTime Desde { get; init; }
    public DateTime Hasta { get; init; }
    public string? Type { get; init; }
    public int? CategoryId { get; init; }
    public int? SubcategoryId { get; init; }
    public int? AccountId { get; init; }
    public int? MerchantId { get; init; }
    public string GroupBy { get; init; } = "total";
    public int Limit { get; init; } = 50;
}

public sealed class TransactionAggregateResult
{
    public decimal TotalExpense { get; init; }
    public decimal TotalIncome { get; init; }
    public string GroupBy { get; init; } = "total";
    public IReadOnlyList<TransactionAggregateBucket> Buckets { get; init; } = [];
}

public sealed class TransactionAggregateBucket
{
    public string? Key { get; init; }
    public int? Id { get; init; }
    public decimal Expense { get; init; }
    public decimal Income { get; init; }
    public int Count { get; init; }
}
