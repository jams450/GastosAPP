using GastosApp.BusinessLogic.Models.Transactions;

namespace GastosApp.BusinessLogic.Interfaces;

public interface IBancoppelImportService
{
    Task<BancoppelImportPreviewResult> PreviewAsync(Stream pdfStream, CancellationToken cancellationToken = default);
    Task<BancoppelImportCommitResult> CommitAsync(int userId, int accountId, IEnumerable<BancoppelImportCommitRow> rows, CancellationToken cancellationToken = default);
}
