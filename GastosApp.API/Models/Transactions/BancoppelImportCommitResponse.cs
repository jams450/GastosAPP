namespace GastosApp.API.Models.Transactions;

public class BancoppelImportCommitResponse
{
    public int CreatedCount { get; set; }
    public int SkippedCount { get; set; }
    public List<string> Warnings { get; set; } = [];
    public List<string> Errors { get; set; } = [];
}
