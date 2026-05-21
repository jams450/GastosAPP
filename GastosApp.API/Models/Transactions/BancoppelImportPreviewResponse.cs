namespace GastosApp.API.Models.Transactions;

public class BancoppelImportPreviewResponse
{
    public List<BancoppelImportPreviewRowResponse> Rows { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
    public List<string> Errors { get; set; } = [];
}

public class BancoppelImportPreviewRowResponse
{
    public int RowNumber { get; set; }
    public DateTime TransactionDate { get; set; }
    public decimal Amount { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}
