using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using GastosApp.API.Models.Transactions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using UglyToad.PdfPig.Core;

namespace GastosApp.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Policy = "UserWithId")]
    public class TransactionsController : ControllerBase
    {
        private readonly ITransactionService _transactionService;
        private readonly IAccountService _accountService;
        private readonly ICurrentUserService _currentUserService;
        private readonly IBancoppelImportService _bancoppelImportService;
        private readonly ILogger<TransactionsController> _logger;

        public TransactionsController(
            ITransactionService transactionService,
            IAccountService accountService,
            ICurrentUserService currentUserService,
            IBancoppelImportService bancoppelImportService,
            ILogger<TransactionsController> logger)
        {
            _transactionService = transactionService;
            _accountService = accountService;
            _currentUserService = currentUserService;
            _bancoppelImportService = bancoppelImportService;
            _logger = logger;
        }

        [HttpGet("account/{accountId}/query")]
        public async Task<IActionResult> QueryByAccount(int accountId, [FromQuery] TransactionQueryRequest request)
        {
            var normalizedStartDate = request.StartDate?.UtcDateTime;
            var normalizedEndDate = NormalizeEndDate(request.EndDate, request.IncludeEndDay);
            if (normalizedStartDate > normalizedEndDate)
            {
                throw new ArgumentException("startDate must be less than or equal to endDate.");
            }

            var userId = GetCurrentUserId();
            var result = await _transactionService.QueryByAccountForUserAsync(accountId, userId, new TransactionQuery
            {
                Page = request.Page,
                PageSize = request.PageSize,
                StartDate = normalizedStartDate,
                EndDate = normalizedEndDate,
                CategoryId = request.CategoryId,
                SubcategoryId = request.SubcategoryId,
                MerchantId = request.MerchantId,
                Type = request.Type?.ToLowerInvariant()
            });

            return Ok(new TransactionQueryResponse
            {
                Page = request.Page,
                PageSize = request.PageSize,
                TotalCount = result.TotalCount,
                Items = result.Items.Select(MapTransaction)
            });
        }

        [HttpGet("account/{accountId}")]
        public async Task<IActionResult> GetByAccount(int accountId)
        {
            var userId = GetCurrentUserId();
            var transactions = await _transactionService.GetAllByAccountIdForUserAsync(accountId, userId);
            return Ok(transactions.Select(MapTransaction));
        }

        [HttpGet("account/{accountId}/date-range")]
        public async Task<IActionResult> GetByDateRange(
            int accountId,
            [FromQuery] DateTimeOffset startDate,
            [FromQuery] DateTimeOffset endDate,
            [FromQuery] bool includeEndDay = false)
        {
            var normalizedStartDate = startDate.UtcDateTime;
            // EndDate is exact by default. Set includeEndDay to include its complete calendar day in the supplied offset.
            var normalizedEndDate = NormalizeEndDate(endDate, includeEndDay);

            if (normalizedStartDate > normalizedEndDate)
            {
                throw new ArgumentException("startDate must be less than or equal to endDate.");
            }

            var userId = GetCurrentUserId();
            var transactions = await _transactionService.GetByDateRangeForUserAsync(accountId, userId, normalizedStartDate, normalizedEndDate);
            return Ok(transactions.Select(MapTransaction));
        }

        [HttpGet("category/{categoryId}")]
        public async Task<IActionResult> GetByCategory(int categoryId)
        {
            var userId = GetCurrentUserId();
            var transactions = await _transactionService.GetByCategoryForUserAsync(categoryId, userId);
            return Ok(transactions.Select(MapTransaction));
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var userId = GetCurrentUserId();
            var transaction = await _transactionService.GetByIdForUserAsync(id, userId);
            if (transaction == null)
                return NotFound(new { Message = $"Transaction with ID {id} not found" });

            return Ok(MapTransaction(transaction));
        }

        [HttpPost("import/bancoppel/preview")]
        [RequestSizeLimit(10_000_000)]
        public async Task<IActionResult> PreviewBancoppelImport([FromForm] IFormFile file, CancellationToken cancellationToken)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { Message = "Archivo PDF requerido." });
            }

            if (file.Length > 10_000_000)
            {
                throw new ArgumentException("El archivo PDF no debe exceder 10 MB.");
            }

            if (!string.Equals(Path.GetExtension(file.FileName), ".pdf", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { Message = "El archivo debe ser PDF." });
            }

            if (!string.Equals(file.ContentType, "application/pdf", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { Message = "Tipo de contenido inválido. Se espera application/pdf." });
            }

            await using var stream = file.OpenReadStream();
            if (!await HasPdfSignatureAsync(stream, cancellationToken))
            {
                return BadRequest(new { Message = "Archivo PDF inválido." });
            }

            try
            {
                var preview = await _bancoppelImportService.PreviewAsync(stream, cancellationToken);

                return Ok(new BancoppelImportPreviewResponse
                {
                    Rows = preview.Rows.Select(r => new BancoppelImportPreviewRowResponse
                    {
                        RowNumber = r.RowNumber,
                        TransactionDate = r.TransactionDate,
                        Amount = r.Amount,
                        Type = r.Type,
                        Description = r.Description
                    }).ToList(),
                    Warnings = preview.Warnings,
                    Errors = preview.Errors
                });
            }
            catch (PdfDocumentFormatException ex)
            {
                throw new ArgumentException("El archivo no tiene un formato PDF válido.", ex);
            }
        }

        [HttpPost("import/bancoppel/commit")]
        public async Task<IActionResult> CommitBancoppelImport([FromBody] BancoppelImportCommitRequest request, CancellationToken cancellationToken)
        {
            var userId = GetCurrentUserId();
            var result = await _bancoppelImportService.CommitAsync(
                userId,
                request.AccountId,
                request.Rows.Select(r => new BancoppelImportCommitRow
                {
                    TransactionDate = r.TransactionDate.UtcDateTime,
                    Amount = r.Amount,
                    Type = r.Type,
                    Description = r.Description,
                    CategoryId = r.CategoryId,
                    SubcategoryId = r.SubcategoryId,
                    MerchantId = r.MerchantId,
                    Tags = r.Tags
                }),
                cancellationToken);

            if (result.Errors.Count > 0)
            {
                return BadRequest(new BancoppelImportCommitResponse
                {
                    CreatedCount = result.CreatedCount,
                    SkippedCount = result.SkippedCount,
                    Warnings = result.Warnings,
                    Errors = result.Errors
                });
            }

            return Ok(new BancoppelImportCommitResponse
            {
                CreatedCount = result.CreatedCount,
                SkippedCount = result.SkippedCount,
                Warnings = result.Warnings,
                Errors = result.Errors
            });
        }

        [HttpPost("income")]
        public async Task<IActionResult> CreateIncome([FromBody] CreateTransactionRequest request)
        {
            // Validar que la cuenta existe
            var account = await _accountService.GetByIdAsync(request.AccountId);
            if (account == null)
                return NotFound(new { Message = $"Account with ID {request.AccountId} not found" });

            var userId = GetCurrentUserId();
            if (account.UserId != userId)
                return Forbid();

            var dimensionsValidation = await _transactionService.ValidateAnalyticsDimensionsAsync(
                userId,
                request.CategoryId,
                request.SubcategoryId,
                request.MerchantId);

            if (!dimensionsValidation.IsValid)
            {
                return BadRequest(new { Message = dimensionsValidation.ErrorMessage });
            }

            var transaction = new Transaction
            {
                AccountId = request.AccountId,
                CategoryId = request.CategoryId,
                SubcategoryId = request.SubcategoryId,
                MerchantId = request.MerchantId,
                Amount = request.Amount,
                Description = request.Description,
                TransactionDate = request.TransactionDate.UtcDateTime
            };

            var allocationItems = request.CreditAllocations?
                .Where(a => a.InstallmentId > 0 && a.Amount > 0)
                .Select(a => (a.InstallmentId, a.Amount))
                .ToList() ?? [];

            var createdTransaction = await _transactionService.CreateIncomeAsync(
                transaction,
                userId,
                allocationItems,
                request.Tags);

            _logger.LogInformation("Income transaction created: {TransactionId}", createdTransaction.TransactionId);

            var created = await _transactionService.GetByIdForUserAsync(createdTransaction.TransactionId, userId);
            return CreatedAtAction(nameof(GetById), new { id = createdTransaction.TransactionId }, MapTransaction(created ?? createdTransaction));
        }

        [HttpPost("expense")]
        public async Task<IActionResult> CreateExpense([FromBody] CreateTransactionRequest request)
        {
            // Validar que la cuenta existe
            var account = await _accountService.GetByIdAsync(request.AccountId);
            if (account == null)
                return NotFound(new { Message = $"Account with ID {request.AccountId} not found" });

            var userId = GetCurrentUserId();
            if (account.UserId != userId)
                return Forbid();

            var dimensionsValidation = await _transactionService.ValidateAnalyticsDimensionsAsync(
                userId,
                request.CategoryId,
                request.SubcategoryId,
                request.MerchantId);

            if (!dimensionsValidation.IsValid)
            {
                return BadRequest(new { Message = dimensionsValidation.ErrorMessage });
            }

            var transaction = new Transaction
            {
                AccountId = request.AccountId,
                CategoryId = request.CategoryId,
                SubcategoryId = request.SubcategoryId,
                MerchantId = request.MerchantId,
                Amount = request.Amount,
                Description = request.Description,
                TransactionDate = request.TransactionDate.UtcDateTime
            };

            var allocationInputs = request.Allocations?
                .Select(a => new GastosApp.BusinessLogic.Models.Transactions.ExpenseAllocationInput
                {
                    BillablePartyId = a.BillablePartyId,
                    Type = a.Type,
                    Value = a.Value
                });

            var createdTransaction = await _transactionService.CreateExpenseAsync(
                transaction,
                userId,
                allocationInputs,
                request.Tags,
                account.IsCredit ? request.MsiMonths : null);

            _logger.LogInformation("Expense transaction created: {TransactionId}", createdTransaction.TransactionId);

            var created = await _transactionService.GetByIdForUserAsync(createdTransaction.TransactionId, userId);
            return CreatedAtAction(nameof(GetById), new { id = createdTransaction.TransactionId }, MapTransaction(created ?? createdTransaction));
        }

        [HttpPost("transfer")]
        public async Task<IActionResult> CreateTransfer([FromBody] CreateTransferRequest request)
        {
            var userId = GetCurrentUserId();
            var dimensionsValidation = await _transactionService.ValidateAnalyticsDimensionsAsync(
                userId,
                request.CategoryId,
                request.SubcategoryId,
                request.MerchantId);

            if (!dimensionsValidation.IsValid)
            {
                return BadRequest(new { Message = dimensionsValidation.ErrorMessage });
            }

            var result = await _transactionService.CreateTransferAsync(
                userId,
                request.SourceAccountId,
                request.DestinationAccountId,
                request.Amount,
                request.Description,
                request.TransactionDate?.UtcDateTime,
                request.CategoryId,
                request.SubcategoryId,
                request.MerchantId,
                request.Tags,
                request.CreditAllocations?
                    .Where(a => a.InstallmentId > 0 && a.Amount > 0)
                    .Select(a => (a.InstallmentId, a.Amount))
                    .ToList());

            if (!result.Success)
                return BadRequest(new { Message = result.ErrorMessage });

            _logger.LogInformation("Transfer created from account {Source} to {Destination}",
                request.SourceAccountId, request.DestinationAccountId);

            return Ok(new { Message = "Transfer created successfully" });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] UpdateTransactionRequest request)
        {
            var userId = GetCurrentUserId();
            var existingTransaction = await _transactionService.GetByIdForUserAsync(id, userId);
            if (existingTransaction == null)
                return NotFound(new { Message = $"Transaction with ID {id} not found" });

            var amountChanged = request.Amount.HasValue && request.Amount.Value != existingTransaction.Amount;
            if (string.Equals(existingTransaction.Type, TransactionDomainConstants.TransactionType.Transfer, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { Message = "Transfers must be updated through PUT /api/transactions/transfer/{transferGroupId}" });
            }

            if (amountChanged && string.Equals(existingTransaction.Type, TransactionDomainConstants.TransactionType.Expense, StringComparison.OrdinalIgnoreCase) && !request.ReplaceAllocations)
            {
                return BadRequest(new { Message = "When changing expense amount you must set ReplaceAllocations=true and send allocations." });
            }

            var transactionToUpdate = new Transaction
            {
                TransactionId = existingTransaction.TransactionId,
                AccountId = existingTransaction.AccountId,
                CategoryId = existingTransaction.CategoryId,
                SubcategoryId = existingTransaction.SubcategoryId,
                MerchantId = existingTransaction.MerchantId,
                Type = existingTransaction.Type,
                TransferGroupId = existingTransaction.TransferGroupId,
                Amount = existingTransaction.Amount,
                BalanceImpact = existingTransaction.BalanceImpact,
                Direction = existingTransaction.Direction,
                CounterpartyAccountId = existingTransaction.CounterpartyAccountId,
                Description = existingTransaction.Description,
                TransactionDate = existingTransaction.TransactionDate,
                Created = existingTransaction.Created,
                Updated = existingTransaction.Updated,
                CreatedBy = existingTransaction.CreatedBy,
                UpdatedBy = existingTransaction.UpdatedBy
            };

            if (request.ClearAnalytics)
            {
                transactionToUpdate.CategoryId = null;
                transactionToUpdate.SubcategoryId = null;
                transactionToUpdate.MerchantId = null;
            }
            else
            {
                if (request.CategoryId.HasValue) transactionToUpdate.CategoryId = request.CategoryId.Value;
                if (request.SubcategoryId.HasValue) transactionToUpdate.SubcategoryId = request.SubcategoryId.Value;
                if (request.MerchantId.HasValue) transactionToUpdate.MerchantId = request.MerchantId.Value;
            }
            if (request.Amount.HasValue) transactionToUpdate.Amount = request.Amount.Value;
            if (request.Description != null) transactionToUpdate.Description = request.Description;
            if (request.TransactionDate.HasValue)
                transactionToUpdate.TransactionDate = request.TransactionDate.Value.UtcDateTime;

            var dimensionsValidation = await _transactionService.ValidateAnalyticsDimensionsAsync(
                userId,
                transactionToUpdate.CategoryId,
                transactionToUpdate.SubcategoryId,
                transactionToUpdate.MerchantId);

            if (!dimensionsValidation.IsValid)
            {
                return BadRequest(new { Message = dimensionsValidation.ErrorMessage });
            }

            var allocationInputs = request.Allocations?
                .Select(a => new GastosApp.BusinessLogic.Models.Transactions.ExpenseAllocationInput
                {
                    BillablePartyId = a.BillablePartyId,
                    Type = a.Type,
                    Value = a.Value
                });

            var updateResult = await _transactionService.UpdateTransactionWithDetailsForUserAsync(
                id,
                userId,
                transactionToUpdate,
                request.Tags,
                allocationInputs,
                request.ReplaceAllocations);

            if (updateResult.Transaction == null)
            {
                return NotFound(new { Message = updateResult.ErrorMessage ?? $"Transaction with ID {id} not found" });
            }

            _logger.LogInformation("Transaction updated: {TransactionId}", id);

            var updated = await _transactionService.GetByIdForUserAsync(id, userId);
            return Ok(MapTransaction(updated ?? updateResult.Transaction));
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var userId = GetCurrentUserId();
            var existingTransaction = await _transactionService.GetByIdForUserAsync(id, userId);
            if (existingTransaction == null)
                return NotFound(new { Message = $"Transaction with ID {id} not found" });

            if (string.Equals(existingTransaction.Type, TransactionDomainConstants.TransactionType.Transfer, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { Message = "Transfers must be deleted through DELETE /api/transactions/transfer/{transferGroupId}" });
            }

            var result = await _transactionService.DeleteForUserAsync(id, userId);
            if (!result)
                return StatusCode(500, new { Message = "Failed to delete transaction" });

            _logger.LogInformation("Transaction deleted: {TransactionId}", id);
            return Ok(new { Message = "Transaction deleted successfully" });
        }

        [HttpDelete("transfer/{transferGroupId}")]
        public async Task<IActionResult> DeleteTransfer(Guid transferGroupId)
        {
            var userId = GetCurrentUserId();
            var result = await _transactionService.DeleteTransferAsync(transferGroupId, userId);
            if (!result)
                return NotFound(new { Message = "Transfer not found" });

            _logger.LogInformation("Transfer deleted: {TransferGroupId}", transferGroupId);
            return Ok(new { Message = "Transfer deleted successfully" });
        }

        [HttpPut("transfer/{transferGroupId}")]
        public async Task<IActionResult> UpdateTransfer(Guid transferGroupId, [FromBody] UpdateTransferRequest request)
        {
            var userId = GetCurrentUserId();
            var result = await _transactionService.UpdateTransferMetadataAsync(
                transferGroupId,
                userId,
                request.CategoryId,
                request.SubcategoryId,
                request.MerchantId,
                request.Description,
                request.TransactionDate?.UtcDateTime,
                request.Tags,
                request.ClearAnalytics);

            if (!result.Success)
            {
                return BadRequest(new { Message = result.ErrorMessage ?? "Failed to update transfer" });
            }

            return Ok(new { Message = "Transfer updated successfully" });
        }

        [HttpPost("account/{accountId}/recalculate-balance")]
        public async Task<IActionResult> RecalculateBalance(int accountId)
        {
            var userId = GetCurrentUserId();
            var account = await _accountService.GetByIdForUserAsync(accountId, userId);
            if (account == null)
                return NotFound(new { Message = $"Account with ID {accountId} not found" });

            var balance = await _transactionService.CalculateAccountBalanceAsync(accountId);
            _logger.LogInformation("Balance recalculated for account {AccountId}: {Balance}", accountId, balance);
            return Ok(new { Balance = balance });
        }

        [HttpGet("credit/{accountId}/open-installments")]
        public async Task<IActionResult> GetOpenCreditInstallments(int accountId)
        {
            var userId = GetCurrentUserId();
            var account = await _accountService.GetByIdForUserAsync(accountId, userId);
            if (account == null)
                return NotFound(new { Message = $"Account with ID {accountId} not found" });

            var installments = await _transactionService.GetOpenCreditInstallmentsAsync(accountId);
            return Ok(installments);
        }

        [HttpPost("credit/convert-charge-msi")]
        public async Task<IActionResult> ConvertChargeToMsi([FromBody] ConvertChargeToMsiRequest request)
        {
            var userId = GetCurrentUserId();
            var sourceTransaction = await _transactionService.GetByIdForUserAsync(request.SourceTransactionId, userId);
            if (sourceTransaction == null)
            {
                return NotFound(new { Message = "No existe transacción origen para convertir a MSI" });
            }

            var result = await _transactionService.ConvertChargeToMsiAsync(request.SourceTransactionId, request.Months);
            if (!result.Success)
            {
                return BadRequest(new { Message = result.ErrorMessage ?? "Failed to convert charge to MSI" });
            }

            return Ok(new { Message = "Cargo convertido a MSI correctamente" });
        }

        [HttpPost("credit/charge-summaries")]
        public async Task<IActionResult> GetCreditChargeSummaries([FromBody] CreditChargeSummariesRequest request)
        {
            var userId = GetCurrentUserId();
            var sourceIds = request.SourceTransactionIds
                .Where(id => id > 0)
                .Distinct()
                .ToList();

            if (sourceIds.Count == 0)
            {
                return Ok(Array.Empty<object>());
            }

            foreach (var sourceId in sourceIds)
            {
                var sourceTransaction = await _transactionService.GetByIdForUserAsync(sourceId, userId);
                if (sourceTransaction == null)
                {
                    return NotFound(new { Message = "Una o más transacciones no existen" });
                }
            }

            var summaries = await _transactionService.GetCreditChargeSummariesAsync(sourceIds);
            return Ok(summaries);
        }

        [HttpPost("credit/apply-existing-payment")]
        public async Task<IActionResult> ApplyExistingCreditPayment([FromBody] ApplyCreditPaymentRequest request)
        {
            var userId = GetCurrentUserId();

            if (request.SourceTransactionId <= 0 || request.CreditAccountId <= 0)
            {
                return BadRequest(new { Message = "Parámetros inválidos" });
            }

            var account = await _accountService.GetByIdForUserAsync(request.CreditAccountId, userId);
            if (account == null)
            {
                return NotFound(new { Message = "Cuenta de crédito no encontrada" });
            }

            if (!account.IsCredit)
            {
                return BadRequest(new { Message = "La cuenta destino no es de crédito" });
            }

            var source = await _transactionService.GetByIdForUserAsync(request.SourceTransactionId, userId);
            if (source == null)
            {
                return NotFound(new { Message = "Transacción origen no encontrada" });
            }

            if (source.AccountId != request.CreditAccountId)
            {
                return BadRequest(new { Message = "La transacción origen no pertenece a la cuenta crédito indicada" });
            }

            if (!(source.Type == TransactionDomainConstants.TransactionType.Income || source.Type == TransactionDomainConstants.TransactionType.Transfer))
            {
                return BadRequest(new { Message = "Solo ingresos o transferencias pueden aplicarse como pago" });
            }

            var amountToApply = request.Amount ?? source.Amount;
            if (amountToApply <= 0)
            {
                return BadRequest(new { Message = "Monto a aplicar inválido" });
            }

            var installments = (await _transactionService.GetOpenCreditInstallmentsAsync(request.CreditAccountId))
                .OrderBy(i => i.DueDate)
                .ToList();

            if (installments.Count == 0)
            {
                return BadRequest(new { Message = "No hay mensualidades pendientes para aplicar" });
            }

            var pendingTotal = installments.Sum(i => i.RemainingAmount);
            if (amountToApply > pendingTotal)
            {
                return BadRequest(new { Message = "Monto a aplicar excede saldo pendiente de mensualidades" });
            }

            var remaining = amountToApply;
            var allocations = new List<(int InstallmentId, decimal Amount)>();
            foreach (var item in installments)
            {
                if (remaining <= 0) break;
                var assign = Math.Min(item.RemainingAmount, remaining);
                if (assign <= 0) continue;
                allocations.Add((item.InstallmentId, assign));
                remaining -= assign;
            }

            if (remaining > 0)
            {
                return BadRequest(new { Message = "No se pudo distribuir monto a mensualidades" });
            }

            var result = await _transactionService.RegisterCreditPaymentAsync(
                request.CreditAccountId,
                request.SourceTransactionId,
                source.TransactionDate,
                amountToApply,
                allocations);

            if (!result.Success)
            {
                return BadRequest(new { Message = result.ErrorMessage ?? "No se pudo aplicar pago existente" });
            }

            return Ok(new { Message = "Pago aplicado a mensualidades correctamente", AppliedAmount = amountToApply });
        }

        [HttpPost("credit/opening-charges")]
        public async Task<IActionResult> CreateOpeningCreditCharges([FromBody] CreateOpeningCreditChargesRequest request)
        {
            var userId = GetCurrentUserId();

            if (request.CreditAccountId <= 0 || request.Items == null || request.Items.Count == 0)
            {
                return BadRequest(new { Message = "Debes enviar cuenta crédito e items válidos" });
            }

            var account = await _accountService.GetByIdForUserAsync(request.CreditAccountId, userId);
            if (account == null)
            {
                return NotFound(new { Message = "La cuenta indicada no existe" });
            }

            if (!account.IsCredit)
            {
                return BadRequest(new { Message = "La cuenta indicada no es de crédito" });
            }

            var result = await _transactionService.CreateOpeningCreditChargesAsync(
                userId,
                request.CreditAccountId,
                request.Items.Select(i => new GastosApp.BusinessLogic.Models.Transactions.OpeningCreditChargeInput
                {
                    CategoryId = i.CategoryId,
                    Amount = i.Amount,
                    Months = i.Months,
                    Description = i.Description,
                    OccurredAt = i.OccurredAt?.UtcDateTime
                }));

            if (!result.Success)
            {
                return BadRequest(new { Message = result.ErrorMessage ?? "No se pudieron crear cargos de apertura" });
            }

            return Ok(new { Message = "Cargos de apertura creados correctamente", CreatedCount = result.CreatedCount });
        }

        private int GetCurrentUserId()
        {
            return _currentUserService.GetUserId()
                ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
        }

        private static DateTime? NormalizeEndDate(DateTimeOffset? endDate, bool includeEndDay)
        {
            return endDate.HasValue ? NormalizeEndDate(endDate.Value, includeEndDay) : null;
        }

        private static DateTime NormalizeEndDate(DateTimeOffset endDate, bool includeEndDay)
        {
            var normalizedEndDate = includeEndDay
                ? new DateTimeOffset(endDate.Date.AddDays(1).AddTicks(-1), endDate.Offset)
                : endDate;

            return normalizedEndDate.UtcDateTime;
        }

        private static async Task<bool> HasPdfSignatureAsync(Stream stream, CancellationToken cancellationToken)
        {
            if (!stream.CanSeek)
            {
                return false;
            }

            stream.Position = 0;
            var signatureBuffer = new byte[5];
            var bytesRead = await stream.ReadAsync(signatureBuffer, cancellationToken);
            stream.Position = 0;

            if (bytesRead < 5)
            {
                return false;
            }

            return signatureBuffer[0] == '%' && signatureBuffer[1] == 'P' && signatureBuffer[2] == 'D' && signatureBuffer[3] == 'F' && signatureBuffer[4] == '-';
        }

        private static TransactionResponse MapTransaction(Transaction transaction)
        {
            var tags = transaction.TransactionTags
                .Where(tt => tt.Tag != null)
                .Select(tt => tt.Tag.Name)
                .OrderBy(name => name)
                .ToArray();

            var allocations = transaction.TransactionAllocations
                .OrderBy(a => a.TransactionAllocationId)
                .Select(a => new TransactionAllocationResponse
                {
                    TransactionAllocationId = a.TransactionAllocationId,
                    BillablePartyId = a.BillablePartyId,
                    BillablePartyName = a.BillableParty?.DisplayName ?? a.BillablePartySnapshotName,
                    AllocationMode = a.AllocationMode,
                    AllocationValue = a.AllocationValue,
                    CalculatedAmount = a.CalculatedAmount
                })
                .ToArray();

            return new TransactionResponse
            {
                TransactionId = transaction.TransactionId,
                AccountId = transaction.AccountId,
                CategoryId = transaction.CategoryId,
                SubcategoryId = transaction.SubcategoryId,
                MerchantId = transaction.MerchantId,
                Type = transaction.Type,
                TransferGroupId = transaction.TransferGroupId,
                Amount = transaction.Amount,
                BalanceImpact = transaction.BalanceImpact,
                Direction = transaction.Direction,
                CounterpartyAccountId = transaction.CounterpartyAccountId,
                Description = transaction.Description,
                TransactionDate = transaction.TransactionDate,
                Tags = tags,
                Allocations = allocations
            };
        }
    }

}
