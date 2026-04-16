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
                    TransactionDate = DateTime.SpecifyKind(request.TransactionDate, DateTimeKind.Utc)
                };

                var createdTransaction = await _transactionService.CreateIncomeAsync(transaction);
                await _transactionService.SyncTransactionTagsAsync(createdTransaction.TransactionId, userId, request.Tags);
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
                    TransactionDate = DateTime.SpecifyKind(request.TransactionDate, DateTimeKind.Utc)
                };

                var createdTransaction = await _transactionService.CreateExpenseAsync(transaction);
                await _transactionService.SyncTransactionTagsAsync(createdTransaction.TransactionId, userId, request.Tags);
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
                    request.TransactionDate,
                    request.CategoryId,
                    request.SubcategoryId,
                    request.MerchantId,
                    request.Tags);

                if (!result.Success)
                    return BadRequest(new { Message = result.ErrorMessage });

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
                    existingTransaction.TransactionDate = DateTime.SpecifyKind(request.TransactionDate.Value, DateTimeKind.Utc);

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
                    request.TransactionDate,
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
