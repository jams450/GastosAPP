using System.Globalization;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Text;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using UglyToad.PdfPig;

namespace GastosApp.BusinessLogic.Services;

public class BancoppelImportService : IBancoppelImportService
{
    private const long MaxPdfBytes = 10_000_000;
    private const int MaxPages = 100;
    private const int MaxExtractedLines = 1000;
    private const int MaxExtractedCharacters = 600_000;
    private const int MaxPreviewRows = 1000;
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
        ArgumentNullException.ThrowIfNull(pdfStream);
        cancellationToken.ThrowIfCancellationRequested();
        if (pdfStream.CanSeek && pdfStream.Length > MaxPdfBytes)
        {
            throw new ArgumentException("El archivo PDF no debe exceder 10 MB.");
        }

        var result = new BancoppelImportPreviewResult();
        using var memory = new MemoryStream();
        var buffer = new byte[81920];
        int read;
        while ((read = await pdfStream.ReadAsync(buffer, cancellationToken)) > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (memory.Length + read > MaxPdfBytes)
            {
                throw new ArgumentException("El archivo PDF no debe exceder 10 MB.");
            }

            await memory.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }

        memory.Position = 0;
        using var document = PdfDocument.Open(memory);
        var pages = document.GetPages().Take(MaxPages + 1).ToList();
        if (pages.Count > MaxPages)
        {
            throw new ArgumentException("El archivo PDF no debe exceder 100 páginas.");
        }

        var allLines = new List<string>();
        var extractedCharacters = 0;
        foreach (var page in pages)
        {
            cancellationToken.ThrowIfCancellationRequested();
            extractedCharacters += page.Text.Length;
            if (extractedCharacters > MaxExtractedCharacters)
            {
                throw new ArgumentException("El PDF excede el límite de texto extraíble.");
            }

            foreach (var line in page.Text.Split('\n'))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var trimmed = line.Trim();
                if (!string.IsNullOrWhiteSpace(trimmed)) allLines.Add(trimmed);
                if (allLines.Count > MaxExtractedLines)
                {
                    throw new ArgumentException("El PDF excede el límite de líneas extraíbles.");
                }
            }
        }

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
            if (rowNumber > MaxPreviewRows)
            {
                throw new ArgumentException("El PDF excede el límite de filas de vista previa.");
            }

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
        // Cuenta inexistente y cuenta ajena responden igual: sin oráculo de existencia.
        if (await _accountService.GetByIdForUserAsync(accountId, userId) == null)
        {
            result.Errors.Add($"Account with ID {accountId} not found.");
            return result;
        }

        var inputRows = rows?.ToList() ?? [];
        if (inputRows.Count == 0)
        {
            result.Errors.Add("No se recibieron filas para importar.");
            return result;
        }

        var commitKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        return await _repository.ExecuteInTransactionAsync(async () =>
        {
            // Pre-filtro de solo lectura: UNA consulta para conocer qué huellas del lote ya existen.
            // Evita entrar al loop de creación (validación de dimensiones + claim) para filas ya importadas.
            // El claim atómico sigue siendo la autoridad de idempotencia para todo lo que no esté aquí.
            var existingFingerprints = await LoadExistingFingerprintsAsync(accountId, inputRows, cancellationToken);

            // Cache en memoria por dimensiones: las filas de un estado de cuenta repiten combinaciones
            // (categoría, subcategoría, comercio); dentro de esta transacción el catálogo no cambia.
            var dimensionsCache = new Dictionary<(int?, int?, int?), (bool IsValid, string? ErrorMessage)>();

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

                var temp = BuildFingerprintSource(accountId, row);

                var dedupeKey = BuildKey(temp);
                if (!commitKeys.Add(dedupeKey))
                {
                    result.SkippedCount++;
                    result.Warnings.Add($"Duplicado en el mismo lote: {row.TransactionDate:yyyy-MM-dd} | {row.Description} | {row.Amount}.");
                    continue;
                }

                var dimensionsKey = (row.CategoryId, row.SubcategoryId, row.MerchantId);
                if (!dimensionsCache.TryGetValue(dimensionsKey, out var dimensionsValidation))
                {
                    dimensionsValidation = await _transactionService.ValidateAnalyticsDimensionsAsync(userId, row.CategoryId, row.SubcategoryId, row.MerchantId);
                    dimensionsCache[dimensionsKey] = dimensionsValidation;
                }

                if (!dimensionsValidation.IsValid)
                {
                    result.SkippedCount++;
                    result.Warnings.Add(dimensionsValidation.ErrorMessage ?? "Dimensiones analíticas inválidas.");
                    continue;
                }

                temp.CategoryId = row.CategoryId;
                temp.SubcategoryId = row.SubcategoryId;
                temp.MerchantId = row.MerchantId;

                var fingerprint = BuildFingerprint(temp);
                if (existingFingerprints.Contains(fingerprint))
                {
                    result.SkippedCount++;
                    result.Warnings.Add($"Posible duplicado existente, omitido: {row.TransactionDate:yyyy-MM-dd} | {row.Description} | {row.Amount}.");
                    continue;
                }

                if (!await _repository.ClaimBancoppelImportedRowAsync(accountId, fingerprint))
                {
                    result.SkippedCount++;
                    result.Warnings.Add($"Posible duplicado existente, omitido: {row.TransactionDate:yyyy-MM-dd} | {row.Description} | {row.Amount}.");
                    continue;
                }

                Transaction created;
                if (row.Type == TransactionDomainConstants.TransactionType.Expense)
                {
                    created = await _transactionService.CreateExpenseAsync(temp, userId, tags: row.Tags);
                }
                else
                {
                    created = await _transactionService.CreateIncomeAsync(temp, userId, tags: row.Tags);
                }

                await _repository.LinkBancoppelImportedRowAsync(accountId, fingerprint, created.TransactionId);
                result.CreatedCount++;
            }

            return result;
        });
    }

    /// <summary>
    /// Construye la transacción base cuyos campos alimentan <see cref="BuildFingerprint"/>.
    /// La huella depende solo de cuenta, tipo, fecha, monto y descripción normalizada:
    /// las dimensiones analíticas se asignan después, por lo que este objeto puede
    /// construirse antes de validarlas.
    /// </summary>
    private static Transaction BuildFingerprintSource(int accountId, BancoppelImportCommitRow row)
    {
        return new Transaction
        {
            AccountId = accountId,
            TransactionDate = DateTime.SpecifyKind(row.TransactionDate.Date, DateTimeKind.Utc),
            Amount = row.Amount,
            Description = row.Description.Trim(),
            Type = row.Type
        };
    }

    /// <summary>
    /// Una sola consulta con las huellas candidatas del lote (mismas guardas baratas que el loop).
    /// Devuelve las que ya existen para la cuenta. No sustituye al claim atómico: solo evita
    /// round-trips redundantes de filas evidentemente repetidas.
    /// </summary>
    private async Task<HashSet<string>> LoadExistingFingerprintsAsync(int accountId, List<BancoppelImportCommitRow> rows, CancellationToken cancellationToken)
    {
        var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var isEligible = row.Amount > 0
                && !string.IsNullOrWhiteSpace(row.Description)
                && (row.Type == TransactionDomainConstants.TransactionType.Expense || row.Type == TransactionDomainConstants.TransactionType.Income);
            if (!isEligible)
            {
                continue;
            }

            candidates.Add(BuildFingerprint(BuildFingerprintSource(accountId, row)));
        }

        var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (candidates.Count == 0)
        {
            return existing;
        }

        var candidateList = candidates.ToList();
        var stored = await _repository
            .Get<BancoppelImportedRow>(r => r.AccountId == accountId && candidateList.Contains(r.Fingerprint))
            .Select(r => r.Fingerprint)
            .ToListAsync(cancellationToken);

        foreach (var fingerprint in stored)
        {
            existing.Add(fingerprint);
        }

        return existing;
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
            NormalizeDescription(transaction.Description));
    }

    private static string BuildFingerprint(Transaction transaction)
    {
        var canonical = $"v1|{BuildKey(transaction)}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }

    private static string NormalizeDescription(string? description)
    {
        return Regex.Replace(description?.Trim() ?? string.Empty, @"\s+", " ").ToLowerInvariant();
    }
}
