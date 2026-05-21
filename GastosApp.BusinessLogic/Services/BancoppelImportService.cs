using System.Globalization;
using System.Text.RegularExpressions;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using UglyToad.PdfPig;

namespace GastosApp.BusinessLogic.Services;

public class BancoppelImportService : IBancoppelImportService
{
    private static readonly Regex DateRegex = new(@"^(?<date>\d{2}[/-]\d{2})\s+(?<description>.+?)\s+(?<amount>[+-]\s?\$?[\d,]+(?:\.\d{2})?)$", RegexOptions.Compiled);

    private readonly IAccountService _accountService;
    private readonly IRepository _repository;
    private readonly ITransactionService _transactionService;

    public BancoppelImportService(IAccountService accountService, IRepository repository, ITransactionService transactionService)
    {
        _accountService = accountService;
        _repository = repository;
        _transactionService = transactionService;
    }

    public async Task<BancoppelImportPreviewResult> PreviewAsync(Stream pdfStream, CancellationToken cancellationToken = default)
    {
        var result = new BancoppelImportPreviewResult();

        using var memory = new MemoryStream();
        await pdfStream.CopyToAsync(memory, cancellationToken);
        memory.Position = 0;

        using var document = PdfDocument.Open(memory);
        var allLines = document.GetPages()
            .SelectMany(p => p.Text.Split('\n'))
            .Select(l => l.Trim())
            .Where(l => !string.IsNullOrWhiteSpace(l))
            .ToList();

        var sectionLines = ExtractRegularChargesSectionLines(allLines, result.Warnings);
        if (sectionLines.Count == 0)
        {
            result.Errors.Add("No se encontró la sección objetivo 'CARGOS, ABONOS Y COMPRAS REGULARES (NO A MESES)'.");
            return result;
        }

        var currentYear = DateTime.UtcNow.Year;
        var rowNumber = 0;

        foreach (var line in sectionLines)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var match = DateRegex.Match(line);
            if (!match.Success)
            {
                continue;
            }

            rowNumber++;
            var datePart = match.Groups["date"].Value;
            var description = match.Groups["description"].Value.Trim();
            var amountPart = match.Groups["amount"].Value.Replace("$", string.Empty).Replace(",", string.Empty).Replace(" ", string.Empty);

            if (!DateTime.TryParseExact($"{datePart}/{currentYear}", "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsedDate)
                && !DateTime.TryParseExact($"{datePart}/{currentYear}", "dd-MM-yyyy", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out parsedDate))
            {
                result.Warnings.Add($"Fila {rowNumber}: fecha inválida '{datePart}'.");
                continue;
            }

            if (!decimal.TryParse(amountPart, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var signedAmount))
            {
                result.Warnings.Add($"Fila {rowNumber}: monto inválido '{match.Groups["amount"].Value}'.");
                continue;
            }

            if (signedAmount == 0)
            {
                result.Warnings.Add($"Fila {rowNumber}: monto cero omitido.");
                continue;
            }

            result.Rows.Add(new BancoppelParsedRow
            {
                RowNumber = rowNumber,
                TransactionDate = DateTime.SpecifyKind(parsedDate.Date, DateTimeKind.Utc),
                Description = description,
                Type = signedAmount > 0 ? TransactionDomainConstants.TransactionType.Expense : TransactionDomainConstants.TransactionType.Income,
                Amount = Math.Abs(signedAmount)
            });
        }

        if (result.Rows.Count == 0)
        {
            result.Warnings.Add("No se detectaron filas válidas en la sección objetivo.");
        }

        return result;
    }

    public async Task<BancoppelImportCommitResult> CommitAsync(int userId, int accountId, IEnumerable<BancoppelImportCommitRow> rows, CancellationToken cancellationToken = default)
    {
        var result = new BancoppelImportCommitResult();
        var account = await _accountService.GetByIdAsync(accountId);
        if (account == null)
        {
            result.Errors.Add($"Account with ID {accountId} not found.");
            return result;
        }

        if (account.UserId != userId)
        {
            result.Errors.Add("La cuenta no pertenece al usuario autenticado.");
            return result;
        }

        var inputRows = rows?.ToList() ?? [];
        if (inputRows.Count == 0)
        {
            result.Errors.Add("No se recibieron filas para importar.");
            return result;
        }

        var minDate = inputRows.Min(r => r.TransactionDate).Date.AddDays(-7);
        var maxDate = inputRows.Max(r => r.TransactionDate).Date.AddDays(7);

        var existing = await _repository
            .Get<Transaction>(t => t.AccountId == accountId && t.TransactionDate >= minDate && t.TransactionDate <= maxDate)
            .ToListAsync(cancellationToken);

        var recentKeys = existing.Select(BuildKey).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var commitKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in inputRows)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (row.Amount <= 0)
            {
                result.SkippedCount++;
                result.Warnings.Add("Se omitió una fila por monto no válido.");
                continue;
            }

            if (string.IsNullOrWhiteSpace(row.Description))
            {
                result.SkippedCount++;
                result.Warnings.Add("Se omitió una fila por descripción vacía.");
                continue;
            }

            if (row.Type != TransactionDomainConstants.TransactionType.Expense && row.Type != TransactionDomainConstants.TransactionType.Income)
            {
                result.SkippedCount++;
                result.Warnings.Add($"Se omitió una fila por tipo inválido '{row.Type}'.");
                continue;
            }

            var temp = new Transaction
            {
                AccountId = accountId,
                TransactionDate = DateTime.SpecifyKind(row.TransactionDate.Date, DateTimeKind.Utc),
                Amount = row.Amount,
                Description = row.Description.Trim(),
                Type = row.Type
            };

            var dedupeKey = BuildKey(temp);
            if (!commitKeys.Add(dedupeKey))
            {
                result.SkippedCount++;
                result.Warnings.Add($"Duplicado en el mismo lote: {row.TransactionDate:yyyy-MM-dd} | {row.Description} | {row.Amount}.");
                continue;
            }

            if (recentKeys.Contains(dedupeKey))
            {
                result.SkippedCount++;
                result.Warnings.Add($"Posible duplicado existente, omitido: {row.TransactionDate:yyyy-MM-dd} | {row.Description} | {row.Amount}.");
                continue;
            }

            var dimensionsValidation = await _transactionService.ValidateAnalyticsDimensionsAsync(userId, row.CategoryId, row.SubcategoryId, row.MerchantId);
            if (!dimensionsValidation.IsValid)
            {
                result.SkippedCount++;
                result.Warnings.Add(dimensionsValidation.ErrorMessage ?? "Dimensiones analíticas inválidas.");
                continue;
            }

            temp.CategoryId = row.CategoryId;
            temp.SubcategoryId = row.SubcategoryId;
            temp.MerchantId = row.MerchantId;

            Transaction created;
            if (row.Type == TransactionDomainConstants.TransactionType.Expense)
            {
                created = await _transactionService.CreateExpenseAsync(temp, userId);
            }
            else
            {
                created = await _transactionService.CreateIncomeAsync(temp);
            }

            await _transactionService.SyncTransactionTagsAsync(created.TransactionId, userId, row.Tags);

            result.CreatedCount++;
            recentKeys.Add(dedupeKey);
        }

        return result;
    }

    private static List<string> ExtractRegularChargesSectionLines(IReadOnlyList<string> allLines, ICollection<string> warnings)
    {
        var startIndex = allLines
            .Select((line, index) => new { line, index })
            .FirstOrDefault(x => x.line.Contains("CARGOS, ABONOS Y COMPRAS REGULARES (NO A MESES)", StringComparison.OrdinalIgnoreCase))?
            .index ?? -1;

        if (startIndex < 0)
        {
            return [];
        }

        var lines = new List<string>();
        for (var i = startIndex + 1; i < allLines.Count; i++)
        {
            var line = allLines[i];
            if (line.Contains("TOTAL", StringComparison.OrdinalIgnoreCase)
                || (line.All(c => !char.IsLetter(c) || char.IsUpper(c) || char.IsWhiteSpace(c) || char.IsPunctuation(c))
                    && line.Contains("CARGOS", StringComparison.OrdinalIgnoreCase)
                    && !line.Contains("REGULARES", StringComparison.OrdinalIgnoreCase)))
            {
                break;
            }

            lines.Add(line);
        }

        if (lines.Count == 0)
        {
            warnings.Add("Sección encontrada pero sin líneas legibles para parsear.");
        }

        return lines;
    }

    private static string BuildKey(Transaction transaction)
    {
        return string.Join('|',
            transaction.AccountId,
            transaction.Type?.Trim().ToLowerInvariant(),
            transaction.TransactionDate.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            transaction.Amount.ToString("0.00", CultureInfo.InvariantCulture),
            (transaction.Description ?? string.Empty).Trim().ToLowerInvariant());
    }
}
