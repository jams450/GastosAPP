namespace GastosApp.BusinessLogic.Models.Transactions;

public class BancoppelParsedRow
{
    public int RowNumber { get; set; }
    public DateTime TransactionDate { get; set; }
    public decimal Amount { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public class BancoppelImportPreviewResult
{
    public List<BancoppelParsedRow> Rows { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
    public List<string> Errors { get; set; } = [];
}

public class BancoppelImportCommitRow
{
    public DateTime TransactionDate { get; set; }
    public decimal Amount { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public int? MerchantId { get; set; }
    public IEnumerable<string>? Tags { get; set; }
}

public class BancoppelImportCommitResult
{
    public int CreatedCount { get; set; }
    public int SkippedCount { get; set; }
    public List<string> Warnings { get; set; } = [];
    public List<string> Errors { get; set; } = [];
}
