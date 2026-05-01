using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.API.Models.Transactions;
using GastosApp.Models.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

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
        private readonly ILogger<TransactionsController> _logger;

        public TransactionsController(
            ITransactionService transactionService,
            IAccountService accountService,
            ICurrentUserService currentUserService,
            ILogger<TransactionsController> logger)
        {
            _transactionService = transactionService;
            _accountService = accountService;
            _currentUserService = currentUserService;
            _logger = logger;
        }

        [HttpGet("account/{accountId}")]
        public async Task<IActionResult> GetByAccount(int accountId)
        {
            try
            {
                var transactions = await _transactionService.GetAllByAccountIdAsync(accountId);
                return Ok(transactions.Select(MapTransaction));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving transactions for account {AccountId}", accountId);
                return StatusCode(500, new { Message = "An error occurred while retrieving transactions" });
            }
        }

        [HttpGet("account/{accountId}/date-range")]
        public async Task<IActionResult> GetByDateRange(
            int accountId,
            [FromQuery] DateTime startDate,
            [FromQuery] DateTime endDate)
        {
            try
            {
                var transactions = await _transactionService.GetByDateRangeAsync(accountId, startDate, endDate);
                return Ok(transactions.Select(MapTransaction));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving transactions for date range");
                return StatusCode(500, new { Message = "An error occurred while retrieving transactions" });
            }
        }

        [HttpGet("category/{categoryId}")]
        public async Task<IActionResult> GetByCategory(int categoryId)
        {
            try
            {
                var transactions = await _transactionService.GetByCategoryAsync(categoryId);
                return Ok(transactions.Select(MapTransaction));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving transactions for category {CategoryId}", categoryId);
                return StatusCode(500, new { Message = "An error occurred while retrieving transactions" });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            try
            {
                var transaction = await _transactionService.GetByIdAsync(id);
                if (transaction == null)
                    return NotFound(new { Message = $"Transaction with ID {id} not found" });

                return Ok(MapTransaction(transaction));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving transaction with ID {Id}", id);
                return StatusCode(500, new { Message = "An error occurred while retrieving the transaction" });
            }
        }

        [HttpPost("income")]
        public async Task<IActionResult> CreateIncome([FromBody] CreateTransactionRequest request)
        {
            try
            {
                // Validar que la cuenta existe
                var account = await _accountService.GetByIdAsync(request.AccountId);
                if (account == null)
                    return NotFound(new { Message = $"Account with ID {request.AccountId} not found" });

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

                var createdTransaction = await _transactionService.CreateIncomeAsync(transaction);
                await _transactionService.SyncTransactionTagsAsync(createdTransaction.TransactionId, userId, request.Tags);

                if (account.IsCredit)
                {
                    var allocationItems = request.CreditAllocations?
                        .Where(a => a.InstallmentId > 0 && a.Amount > 0)
                        .Select(a => (a.InstallmentId, a.Amount))
                        .ToList() ?? [];

                    var paymentResult = await _transactionService.RegisterCreditPaymentAsync(
                        account.AccountId,
                        createdTransaction.TransactionId,
                        transaction.TransactionDate,
                        transaction.Amount,
                        allocationItems);

                    if (!paymentResult.Success)
                    {
                        return BadRequest(new { Message = paymentResult.ErrorMessage ?? "No se pudo registrar pago de crédito" });
                    }
                }

                _logger.LogInformation("Income transaction created: {TransactionId}", createdTransaction.TransactionId);

                var created = await _transactionService.GetByIdAsync(createdTransaction.TransactionId);
                return CreatedAtAction(nameof(GetById), new { id = createdTransaction.TransactionId }, MapTransaction(created ?? createdTransaction));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating income transaction");
                return StatusCode(500, new { Message = "An error occurred while creating the transaction" });
            }
        }

        [HttpPost("expense")]
        public async Task<IActionResult> CreateExpense([FromBody] CreateTransactionRequest request)
        {
            try
            {
                // Validar que la cuenta existe
                var account = await _accountService.GetByIdAsync(request.AccountId);
                if (account == null)
                    return NotFound(new { Message = $"Account with ID {request.AccountId} not found" });

                // Validar saldo suficiente
                if (account.CurrentBalance < request.Amount)
                    return BadRequest(new { Message = "Insufficient balance" });

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

                var createdTransaction = await _transactionService.CreateExpenseAsync(transaction);
                await _transactionService.SyncTransactionTagsAsync(createdTransaction.TransactionId, userId, request.Tags);

                if (account.IsCredit && request.MsiMonths.HasValue && request.MsiMonths.Value > 1)
                {
                    var convertResult = await _transactionService.ConvertChargeToMsiAsync(
                        createdTransaction.TransactionId,
                        request.MsiMonths.Value);

                    if (!convertResult.Success)
                    {
                        return BadRequest(new { Message = convertResult.ErrorMessage ?? "No se pudo convertir cargo a MSI" });
                    }
                }

                _logger.LogInformation("Expense transaction created: {TransactionId}", createdTransaction.TransactionId);

                var created = await _transactionService.GetByIdAsync(createdTransaction.TransactionId);
                return CreatedAtAction(nameof(GetById), new { id = createdTransaction.TransactionId }, MapTransaction(created ?? createdTransaction));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating expense transaction");
                return StatusCode(500, new { Message = "An error occurred while creating the transaction" });
            }
        }

        [HttpPost("transfer")]
        public async Task<IActionResult> CreateTransfer([FromBody] CreateTransferRequest request)
        {
            try
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
                    request.SourceAccountId,
                    request.DestinationAccountId,
                    request.Amount,
                    request.Description,
                    request.TransactionDate?.UtcDateTime,
                    request.CategoryId,
                    request.SubcategoryId,
                    request.MerchantId,
                    request.Tags);

                if (!result.Success)
                    return BadRequest(new { Message = result.ErrorMessage });

                var destinationAccount = await _accountService.GetByIdAsync(request.DestinationAccountId);
                if (destinationAccount?.IsCredit == true)
                {
                    var destinationTransactions = await _transactionService.GetAllByAccountIdAsync(request.DestinationAccountId);
                    var destinationTx = destinationTransactions
                        .Where(t => t.Type == "transfer" && t.Direction == "credit" && t.CounterpartyAccountId == request.SourceAccountId)
                        .OrderByDescending(t => t.TransactionId)
                        .FirstOrDefault();

                    if (destinationTx != null)
                    {
                        var allocationItems = request.CreditAllocations?
                            .Where(a => a.InstallmentId > 0 && a.Amount > 0)
                            .Select(a => (a.InstallmentId, a.Amount))
                            .ToList() ?? [];

                        var paymentResult = await _transactionService.RegisterCreditPaymentAsync(
                            destinationAccount.AccountId,
                            destinationTx.TransactionId,
                            destinationTx.TransactionDate,
                            destinationTx.Amount,
                            allocationItems);

                        if (!paymentResult.Success)
                        {
                            return BadRequest(new { Message = paymentResult.ErrorMessage ?? "No se pudo registrar pago de crédito" });
                        }
                    }
                }

                _logger.LogInformation("Transfer created from account {Source} to {Destination}", 
                    request.SourceAccountId, request.DestinationAccountId);

                return Ok(new { Message = "Transfer created successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating transfer");
                return StatusCode(500, new { Message = "An error occurred while creating the transfer" });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] UpdateTransactionRequest request)
        {
            try
            {
                var existingTransaction = await _transactionService.GetByIdAsync(id);
                if (existingTransaction == null)
                    return NotFound(new { Message = $"Transaction with ID {id} not found" });

                // Actualizar campos
                if (request.CategoryId.HasValue) existingTransaction.CategoryId = request.CategoryId.Value;
                if (request.SubcategoryId.HasValue) existingTransaction.SubcategoryId = request.SubcategoryId.Value;
                if (request.MerchantId.HasValue) existingTransaction.MerchantId = request.MerchantId.Value;
                if (request.Amount.HasValue) existingTransaction.Amount = request.Amount.Value;
                if (request.Description != null) existingTransaction.Description = request.Description;
                if (request.TransactionDate.HasValue) 
                    existingTransaction.TransactionDate = request.TransactionDate.Value.UtcDateTime;

                var userId = GetCurrentUserId();
                var dimensionsValidation = await _transactionService.ValidateAnalyticsDimensionsAsync(
                    userId,
                    existingTransaction.CategoryId,
                    existingTransaction.SubcategoryId,
                    existingTransaction.MerchantId);

                if (!dimensionsValidation.IsValid)
                {
                    return BadRequest(new { Message = dimensionsValidation.ErrorMessage });
                }

                var updatedTransaction = await _transactionService.UpdateAsync(id, existingTransaction);
                await _transactionService.SyncTransactionTagsAsync(id, userId, request.Tags);
                _logger.LogInformation("Transaction updated: {TransactionId}", id);

                var updated = await _transactionService.GetByIdAsync(id);
                return Ok(MapTransaction(updated ?? updatedTransaction!));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating transaction with ID {Id}", id);
                return StatusCode(500, new { Message = "An error occurred while updating the transaction" });
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                var existingTransaction = await _transactionService.GetByIdAsync(id);
                if (existingTransaction == null)
                    return NotFound(new { Message = $"Transaction with ID {id} not found" });

                var result = await _transactionService.DeleteAsync(id);
                if (!result)
                    return StatusCode(500, new { Message = "Failed to delete transaction" });

                _logger.LogInformation("Transaction deleted: {TransactionId}", id);
                return Ok(new { Message = "Transaction deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting transaction with ID {Id}", id);
                return StatusCode(500, new { Message = "An error occurred while deleting the transaction" });
            }
        }

        [HttpDelete("transfer/{transferGroupId}")]
        public async Task<IActionResult> DeleteTransfer(Guid transferGroupId)
        {
            try
            {
                var result = await _transactionService.DeleteTransferAsync(transferGroupId);
                if (!result)
                    return NotFound(new { Message = "Transfer not found" });

                _logger.LogInformation("Transfer deleted: {TransferGroupId}", transferGroupId);
                return Ok(new { Message = "Transfer deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting transfer with GroupId {TransferGroupId}", transferGroupId);
                return StatusCode(500, new { Message = "An error occurred while deleting the transfer" });
            }
        }

        [HttpPut("transfer/{transferGroupId}")]
        public async Task<IActionResult> UpdateTransfer(Guid transferGroupId, [FromBody] UpdateTransferRequest request)
        {
            try
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
                    request.Tags);

                if (!result.Success)
                {
                    return BadRequest(new { Message = result.ErrorMessage ?? "Failed to update transfer" });
                }

                return Ok(new { Message = "Transfer updated successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating transfer with GroupId {TransferGroupId}", transferGroupId);
                return StatusCode(500, new { Message = "An error occurred while updating the transfer" });
            }
        }

        [HttpPost("account/{accountId}/recalculate-balance")]
        public async Task<IActionResult> RecalculateBalance(int accountId)
        {
            try
            {
                var balance = await _transactionService.CalculateAccountBalanceAsync(accountId);
                _logger.LogInformation("Balance recalculated for account {AccountId}: {Balance}", accountId, balance);
                return Ok(new { Balance = balance });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error recalculating balance for account {AccountId}", accountId);
                return StatusCode(500, new { Message = "An error occurred while recalculating balance" });
            }
        }

        [HttpGet("credit/{accountId}/open-installments")]
        public async Task<IActionResult> GetOpenCreditInstallments(int accountId)
        {
            try
            {
                var installments = await _transactionService.GetOpenCreditInstallmentsAsync(accountId);
                return Ok(installments);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving open installments for account {AccountId}", accountId);
                return StatusCode(500, new { Message = "An error occurred while retrieving open installments" });
            }
        }

        [HttpPost("credit/convert-charge-msi")]
        public async Task<IActionResult> ConvertChargeToMsi([FromBody] ConvertChargeToMsiRequest request)
        {
            try
            {
                var result = await _transactionService.ConvertChargeToMsiAsync(request.SourceTransactionId, request.Months);
                if (!result.Success)
                {
                    return BadRequest(new { Message = result.ErrorMessage ?? "Failed to convert charge to MSI" });
                }

                return Ok(new { Message = "Cargo convertido a MSI correctamente" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error converting charge {TransactionId} to MSI", request.SourceTransactionId);
                return StatusCode(500, new { Message = "An error occurred while converting charge to MSI" });
            }
        }

        [HttpPost("credit/charge-summaries")]
        public async Task<IActionResult> GetCreditChargeSummaries([FromBody] CreditChargeSummariesRequest request)
        {
            try
            {
                var sourceIds = request.SourceTransactionIds
                    .Where(id => id > 0)
                    .Distinct()
                    .ToList();

                if (sourceIds.Count == 0)
                {
                    return Ok(Array.Empty<object>());
                }

                var summaries = await _transactionService.GetCreditChargeSummariesAsync(sourceIds);
                return Ok(summaries);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving credit charge summaries");
                return StatusCode(500, new { Message = "An error occurred while retrieving credit charge summaries" });
            }
        }

        [HttpPost("credit/apply-existing-payment")]
        public async Task<IActionResult> ApplyExistingCreditPayment([FromBody] ApplyCreditPaymentRequest request)
        {
            try
            {
                if (request.SourceTransactionId <= 0 || request.CreditAccountId <= 0)
                {
                    return BadRequest(new { Message = "Parámetros inválidos" });
                }

                var account = await _accountService.GetByIdAsync(request.CreditAccountId);
                if (account == null || !account.IsCredit)
                {
                    return BadRequest(new { Message = "La cuenta destino no es de crédito" });
                }

                var source = await _transactionService.GetByIdAsync(request.SourceTransactionId);
                if (source == null)
                {
                    return NotFound(new { Message = "Transacción origen no encontrada" });
                }

                if (source.AccountId != request.CreditAccountId)
                {
                    return BadRequest(new { Message = "La transacción origen no pertenece a la cuenta crédito indicada" });
                }

                if (!(source.Type == "income" || source.Type == "transfer"))
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
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error applying existing payment transaction {TransactionId}", request.SourceTransactionId);
                return StatusCode(500, new { Message = "An error occurred while applying existing payment" });
            }
        }

        [HttpPost("credit/opening-charges")]
        public async Task<IActionResult> CreateOpeningCreditCharges([FromBody] CreateOpeningCreditChargesRequest request)
        {
            try
            {
                if (request.CreditAccountId <= 0 || request.Items == null || request.Items.Count == 0)
                {
                    return BadRequest(new { Message = "Debes enviar cuenta crédito e items válidos" });
                }

                var account = await _accountService.GetByIdAsync(request.CreditAccountId);
                if (account == null || !account.IsCredit)
                {
                    return BadRequest(new { Message = "La cuenta indicada no es de crédito" });
                }

                var result = await _transactionService.CreateOpeningCreditChargesAsync(
                    request.CreditAccountId,
                    request.Items.Select(i => new GastosApp.BusinessLogic.Models.Transactions.OpeningCreditChargeInput
                    {
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
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating opening credit charges for account {AccountId}", request.CreditAccountId);
                return StatusCode(500, new { Message = "An error occurred while creating opening credit charges" });
            }
        }

        private int GetCurrentUserId()
        {
            return _currentUserService.GetUserId()
                ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
        }

        private static TransactionResponse MapTransaction(Transaction transaction)
        {
            var tags = transaction.TransactionTags
                .Where(tt => tt.Tag != null)
                .Select(tt => tt.Tag.Name)
                .OrderBy(name => name)
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
                Tags = tags
            };
        }
    }

}
