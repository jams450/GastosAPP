using GastosApp.API.Models.Accounts;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using Mapster;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Policy = "UserWithId")]
    public class AccountsController : ControllerBase
    {
        private readonly IAccountService _accountService;
        private readonly ICurrentUserService _currentUserService;
        private readonly ILogger<AccountsController> _logger;

        public AccountsController(
            IAccountService accountService,
            ICurrentUserService currentUserService,
            ILogger<AccountsController> logger)
        {
            _accountService = accountService;
            _currentUserService = currentUserService;
            _logger = logger;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var userId = GetCurrentUserId();
                var accounts = await _accountService.GetAllByUserIdAsync(userId);
                var response = accounts.Adapt<IEnumerable<AccountResponse>>();
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving accounts");
                return StatusCode(500, new { Message = "An error occurred while retrieving accounts" });
            }
        }

        [HttpGet("active")]
        public async Task<IActionResult> GetAllActive()
        {
            try
            {
                var userId = GetCurrentUserId();
                var accounts = await _accountService.GetAllActiveByUserIdAsync(userId);
                var response = accounts.Adapt<IEnumerable<AccountResponse>>();
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving active accounts");
                return StatusCode(500, new { Message = "An error occurred while retrieving accounts" });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            try
            {
                var account = await _accountService.GetByIdAsync(id);
                if (account == null)
                    return NotFound(new { Message = $"Account with ID {id} not found" });

                return Ok(account.Adapt<AccountResponse>());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving account with ID {Id}", id);
                return StatusCode(500, new { Message = "An error occurred while retrieving the account" });
            }
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] AccountCreateRequest request)
        {
            try
            {
                var userId = GetCurrentUserId();

                // Validar el modelo incluyendo las reglas de negocio
                var validationResults = new List<ValidationResult>();
                var validationContext = new ValidationContext(request);
                
                if (!Validator.TryValidateObject(request, validationContext, validationResults, true))
                {
                    return BadRequest(new { Message = "Validation failed", Errors = validationResults.Select(v => v.ErrorMessage) });
                }

                // Validar reglas de negocio personalizadas
                var customValidations = request.Validate(validationContext);
                validationResults.AddRange(customValidations);
                
                if (validationResults.Any())
                {
                    return BadRequest(new { Message = "Validation failed", Errors = validationResults.Select(v => v.ErrorMessage) });
                }

                var account = new Account
                {
                    UserId = userId,
                    Name = request.Name,
                    Color = request.Color,
                    StartDate = DateTime.SpecifyKind(request.StartDate, DateTimeKind.Utc),
                    IsCredit = request.IsCredit,
                    DueDay = request.DueDay,
                    PaymentDueDay = request.PaymentDueDay,
                    EarnsInterest = request.EarnsInterest,
                    AnnualInterestRate = request.AnnualInterestRate,
                    InitialBalance = request.InitialBalance,
                    CurrentBalance = request.InitialBalance,
                    CreditLimit = request.CreditLimit
                };

                var createdAccount = await _accountService.CreateAsync(account);
                _logger.LogInformation("Account created successfully: {AccountId}", createdAccount.AccountId);

                return CreatedAtAction(nameof(GetById), new { id = createdAccount.AccountId }, createdAccount.Adapt<AccountResponse>());
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating account");
                return StatusCode(500, new { Message = "An error occurred while creating the account" });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] AccountUpdateRequest request)
        {
            try
            {
                var existingAccount = await _accountService.GetByIdAsync(id);
                if (existingAccount == null)
                    return NotFound(new { Message = $"Account with ID {id} not found" });

                // Validar reglas de negocio personalizadas
                var validationContext = new ValidationContext(request);
                var customValidations = request.Validate(validationContext).ToList();
                
                if (customValidations.Any())
                {
                    return BadRequest(new { Message = "Validation failed", Errors = customValidations.Select(v => v.ErrorMessage) });
                }

                // Actualizar solo los campos proporcionados
                if (request.Name != null) existingAccount.Name = request.Name;
                if (request.Color != null) existingAccount.Color = request.Color;
                if (request.Active.HasValue) existingAccount.Active = request.Active.Value;
                if (request.StartDate.HasValue) existingAccount.StartDate = DateTime.SpecifyKind(request.StartDate.Value, DateTimeKind.Utc);
                if (request.IsCredit.HasValue) existingAccount.IsCredit = request.IsCredit.Value;
                if (request.DueDay.HasValue) existingAccount.DueDay = request.DueDay.Value;
                if (request.PaymentDueDay.HasValue) existingAccount.PaymentDueDay = request.PaymentDueDay.Value;
                if (request.EarnsInterest.HasValue) existingAccount.EarnsInterest = request.EarnsInterest.Value;
                if (request.InitialBalance.HasValue) existingAccount.InitialBalance = request.InitialBalance.Value;
                if (request.AnnualInterestRate.HasValue) existingAccount.AnnualInterestRate = request.AnnualInterestRate.Value;
                if (request.CurrentBalance.HasValue) existingAccount.CurrentBalance = request.CurrentBalance.Value;
                if (request.CreditLimit.HasValue) existingAccount.CreditLimit = request.CreditLimit.Value;

                var updatedAccount = await _accountService.UpdateAsync(id, existingAccount);
                _logger.LogInformation("Account updated successfully: {AccountId}", id);

                return Ok(updatedAccount!.Adapt<AccountResponse>());
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating account with ID {Id}", id);
                return StatusCode(500, new { Message = "An error occurred while updating the account" });
            }
        }

        [HttpPatch("{id}/active")]
        public async Task<IActionResult> UpdateActiveStatus(int id, [FromBody] bool active)
        {
            try
            {
                var existingAccount = await _accountService.GetByIdAsync(id);
                if (existingAccount == null)
                    return NotFound(new { Message = $"Account with ID {id} not found" });

                var result = await _accountService.UpdateActiveStatusAsync(id, active);
                if (!result)
                    return StatusCode(500, new { Message = "Failed to update account status" });

                _logger.LogInformation("Account {Id} active status updated to {Active}", id, active);
                return Ok(new { Message = $"Account active status updated to {active}" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating active status for account with ID {Id}", id);
                return StatusCode(500, new { Message = "An error occurred while updating the account status" });
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                var existingAccount = await _accountService.GetByIdAsync(id);
                if (existingAccount == null)
                    return NotFound(new { Message = $"Account with ID {id} not found" });

                var result = await _accountService.DeleteAsync(id);
                if (!result)
                    return StatusCode(500, new { Message = "Failed to delete account" });

                _logger.LogInformation("Account deleted successfully: {Id}", id);
                return Ok(new { Message = "Account deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting account with ID {Id}", id);
                return StatusCode(500, new { Message = "An error occurred while deleting the account" });
            }
        }

        [HttpPost("{id}/recalculate-balance")]
        public async Task<IActionResult> RecalculateBalance(int id)
        {
            try
            {
                var existingAccount = await _accountService.GetByIdAsync(id);
                if (existingAccount == null)
                    return NotFound(new { Message = $"Account with ID {id} not found" });

                var result = await _accountService.RecalculateBalanceAsync(id);
                if (!result)
                    return StatusCode(500, new { Message = "Failed to recalculate balance" });

                _logger.LogInformation("Account {Id} balance recalculated", id);
                return Ok(new { Message = "Balance recalculated successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error recalculating balance for account with ID {Id}", id);
                return StatusCode(500, new { Message = "An error occurred while recalculating the balance" });
            }
        }

        [HttpGet("{id}/credit-expenses")]
        public async Task<IActionResult> GetCreditCardExpenses(int id, [FromQuery] DateTime? referenceDate)
        {
            try
            {
                var account = await _accountService.GetByIdAsync(id);
                if (account == null)
                    return NotFound(new { Message = $"Account with ID {id} not found" });

                if (!account.IsCredit)
                    return BadRequest(new { Message = "This endpoint is only for credit accounts" });

                var date = referenceDate ?? DateTime.UtcNow;
                var result = await _accountService.GetCreditCardExpensesForPeriodAsync(id, date);

                return Ok(new
                {
                    AccountId = id,
                    AccountName = account.Name,
                    DueDay = account.DueDay,
                    ReferenceDate = date,
                    PeriodStart = result.PeriodStart,
                    PeriodEnd = result.PeriodEnd,
                    TotalExpenses = result.TotalExpenses,
                    Message = $"Expenses from {result.PeriodStart:yyyy-MM-dd} to {result.PeriodEnd:yyyy-MM-dd}"
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting credit card expenses for account {Id}", id);
                return StatusCode(500, new { Message = "An error occurred while retrieving credit card expenses" });
            }
        }

        private int GetCurrentUserId()
        {
            return _currentUserService.GetUserId()
                ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");
        }
    }
}
