using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace GastosApp.BusinessLogic.Services
{
    public class TransactionCommandService : ITransactionCommandService
    {
        // Índice único parcial uq_budget_items_transaction, reconocido por nombre porque vive solo
        // en SQL (mismo criterio que BudgetItemMatchService).
        private const string BudgetItemTransactionUniqueIndexName = "uq_budget_items_transaction";

        private readonly IRepository _repository;
        private readonly IAccountService _accountService;
        private readonly IExpenseAllocationService _allocationService;
        private readonly ICreditLifecycleService _creditLifecycleService;
        private readonly ITransactionValidationService _validation;
        private readonly ITransactionTagService _tagService;
        private readonly ICatalogRuleService _catalogRuleService;
        private readonly IBudgetItemMatchService _budgetItemMatchService;
        private readonly ILogger<TransactionCommandService> _logger;

        public TransactionCommandService(
            IRepository repository,
            IAccountService accountService,
            IExpenseAllocationService allocationService,
            ICreditLifecycleService creditLifecycleService,
            ITransactionValidationService validation,
            ITransactionTagService tagService,
            ICatalogRuleService catalogRuleService,
            IBudgetItemMatchService budgetItemMatchService,
            ILogger<TransactionCommandService> logger)
        {
            _repository = repository;
            _accountService = accountService;
            _allocationService = allocationService;
            _creditLifecycleService = creditLifecycleService;
            _validation = validation;
            _tagService = tagService;
            _catalogRuleService = catalogRuleService;
            _budgetItemMatchService = budgetItemMatchService;
            _logger = logger;
        }

        public async Task<Transaction> CreateIncomeAsync(Transaction transaction, int userId, IEnumerable<(int InstallmentId, decimal Amount)>? creditAllocations = null, IEnumerable<string>? tags = null)
        {
            var created = await _repository.ExecuteInTransactionAsync(async () =>
            {
                if (transaction.Amount <= 0)
                {
                    throw new ArgumentException("El monto del ingreso debe ser mayor a cero");
                }

                var lockedAccounts = await _repository.LockAccountsAsync([transaction.AccountId]);
                var account = lockedAccounts.SingleOrDefault();
                if (account == null || account.UserId != userId)
                {
                    throw new ArgumentException("La cuenta indicada no existe");
                }

                var dimensionsValidation = await _validation.ValidateAnalyticsDimensionsAsync(
                    userId,
                    transaction.CategoryId,
                    transaction.SubcategoryId,
                    transaction.MerchantId,
                    TransactionDomainConstants.TransactionType.Income);
                if (!dimensionsValidation.IsValid)
                {
                    throw new ArgumentException(dimensionsValidation.ErrorMessage ?? "Dimensiones analíticas inválidas");
                }

                transaction.Type = TransactionDomainConstants.TransactionType.Income;
                transaction.BalanceImpact = transaction.Amount;
                transaction.Direction = TransactionDomainConstants.Direction.Credit;
                transaction.CounterpartyAccountId = null;
                transaction.TransactionDate = _validation.EnsureUtc(transaction.TransactionDate);

                var result = await _repository.Save(transaction);
                await _tagService.SyncTransactionTagsAsync(result.TransactionId, userId, tags);
                await UpdateAccountBalanceAsync(transaction.AccountId, transaction.Amount);

                if (account.IsCredit)
                {
                    var paymentResult = await _creditLifecycleService.RegisterCreditPaymentAsync(
                        userId,
                        account.AccountId,
                        result.TransactionId,
                        result.TransactionDate,
                        result.Amount,
                        creditAllocations ?? []);

                    if (!paymentResult.Success)
                    {
                        throw new ArgumentException(paymentResult.ErrorMessage ?? "No se pudo registrar pago de crédito");
                    }
                }

                return result;
            });

            await TryMatchBudgetItemsAsync(created.TransactionId, userId);

            return created;
        }

        public async Task<Transaction> CreateExpenseAsync(Transaction transaction, int userId, IEnumerable<ExpenseAllocationInput>? allocations = null, IEnumerable<string>? tags = null, int? msiMonths = null, int? budgetItemId = null)
        {
            if (msiMonths.HasValue && msiMonths.Value > 60)
            {
                throw new ArgumentException("Meses MSI debe estar entre 1 y 60");
            }

            var created = await _repository.ExecuteInTransactionAsync(async () =>
            {
                if (transaction.Amount <= 0)
                {
                    throw new ArgumentException("El monto del gasto debe ser mayor a cero");
                }

                var lockedAccounts = await _repository.LockAccountsAsync([transaction.AccountId]);
                var account = lockedAccounts.SingleOrDefault();
                if (account == null || account.UserId != userId)
                {
                    throw new ArgumentException("La cuenta indicada no existe");
                }

                if (transaction.CategoryId == null && transaction.SubcategoryId == null)
                {
                    await TryApplyCatalogRuleAsync(transaction, userId);
                }

                var dimensionsValidation = await _validation.ValidateAnalyticsDimensionsAsync(
                    userId,
                    transaction.CategoryId,
                    transaction.SubcategoryId,
                    transaction.MerchantId,
                    TransactionDomainConstants.TransactionType.Expense);
                if (!dimensionsValidation.IsValid)
                {
                    throw new ArgumentException(dimensionsValidation.ErrorMessage ?? "Dimensiones analíticas inválidas");
                }

                transaction.Type = TransactionDomainConstants.TransactionType.Expense;
                transaction.BalanceImpact = transaction.Amount * -1;
                transaction.Direction = TransactionDomainConstants.Direction.Debit;
                transaction.CounterpartyAccountId = null;
                transaction.TransactionDate = _validation.EnsureUtc(transaction.TransactionDate);

                // Alta "desde partida": se valida aquí, antes de escribir, para que un id ajeno, un
                // mes distinto o un alcance que no coincide respondan 400 sin alta parcial. El
                // enlace en sí se confirma después del commit (ver TryLinkBudgetItemAfterCreateAsync).
                if (budgetItemId.HasValue)
                {
                    await ValidateBudgetItemLinkForNewExpenseAsync(
                        userId,
                        budgetItemId.Value,
                        transaction.CategoryId,
                        transaction.SubcategoryId,
                        transaction.TransactionDate);
                }

                var result = await _repository.Save(transaction);
                var allocationResult = await _allocationService.ReplaceExpenseAllocationsAsync(result.TransactionId, userId, allocations, true);
                if (!allocationResult.Success)
                {
                    throw new ArgumentException(allocationResult.ErrorMessage ?? "Invalid expense allocation");
                }

                await _tagService.SyncTransactionTagsAsync(result.TransactionId, userId, tags);
                await UpdateAccountBalanceAsync(transaction.AccountId, -transaction.Amount);
                if (account.IsCredit)
                {
                    await _creditLifecycleService.CreateCreditChargeWithPlanAsync(result, 1, TransactionDomainConstants.CreditPlanType.Revolving);

                    if (msiMonths.HasValue && msiMonths.Value > 1)
                    {
                        var convertResult = await _creditLifecycleService.ConvertChargeToMsiAsync(userId, result.TransactionId, msiMonths.Value);
                        if (!convertResult.Success)
                        {
                            throw new ArgumentException(convertResult.ErrorMessage ?? "No se pudo convertir cargo a MSI");
                        }
                    }
                }

                return result;
            });

            if (budgetItemId.HasValue)
            {
                await TryLinkBudgetItemAfterCreateAsync(budgetItemId.Value, created.TransactionId, userId);
            }

            await TryMatchBudgetItemsAsync(created.TransactionId, userId);

            return created;
        }

        /// <summary>
        /// Enlace manual de una transacción existente a una partida <c>pending</c>: exige mismo mes,
        /// mismo tipo y mismo alcance, y admite cualquier monto (el real manda). La fila se bloquea
        /// con <c>SELECT … FOR UPDATE</c> antes de leerla, así que dos enlaces concurrentes sobre la
        /// misma partida no pueden enlazarse los dos; la carrera simétrica —una transacción
        /// reclamada por dos partidas— la cierra <c>uq_budget_items_transaction</c>, tratada como
        /// carrera ya resuelta y no como error.
        /// </summary>
        public Task<BudgetItemLinkOutcome> LinkBudgetItemAsync(int userId, int itemId, int transactionId, CancellationToken cancellationToken)
        {
            return _repository.ExecuteInTransactionAsync(async () =>
            {
                var item = await _repository.LockBudgetItemAsync(itemId, userId);
                if (item == null)
                {
                    return BudgetItemLinkOutcome.Of(BudgetItemLinkOutcomeStatus.ItemNotFound, itemId, transactionId);
                }

                if (item.Status != BudgetItemStatus.Pending || item.TransactionId.HasValue)
                {
                    return BudgetItemLinkOutcome.Of(BudgetItemLinkOutcomeStatus.ItemNotLinkable, itemId, transactionId);
                }

                var transaction = await _repository.Get<Transaction>(t =>
                        t.TransactionId == transactionId && t.Account.UserId == userId)
                    .Select(t => new
                    {
                        t.TransactionId,
                        t.Type,
                        t.CategoryId,
                        t.SubcategoryId,
                        t.TransactionDate
                    })
                    .FirstOrDefaultAsync(cancellationToken);

                if (transaction == null)
                {
                    return BudgetItemLinkOutcome.Of(BudgetItemLinkOutcomeStatus.TransactionNotFound, itemId, transactionId);
                }

                var reason = EvaluateLinkEligibility(
                    item.Kind,
                    item.PeriodKey,
                    item.CategoryId,
                    item.SubcategoryId,
                    transaction.Type,
                    transaction.CategoryId,
                    transaction.SubcategoryId,
                    transaction.TransactionDate);

                if (reason != null)
                {
                    return BudgetItemLinkOutcome.Of(reason.Value, itemId, transactionId);
                }

                // Atajo para el caso simétrico: evita provocar a propósito la violación del índice.
                // La garantía es el índice, no este chequeo.
                var claimedByOther = await _repository.Get<BudgetItem>(i =>
                        i.TransactionId == transactionId && i.ItemId != itemId)
                    .AnyAsync(cancellationToken); // alcance-por-referencia: la transacción fue validada para este usuario en este método; el atajo evita provocar la violación del índice único.

                if (claimedByOther)
                {
                    return BudgetItemLinkOutcome.Of(BudgetItemLinkOutcomeStatus.TransactionAlreadyLinked, itemId, transactionId);
                }

                item.Status = BudgetItemStatus.Executed;
                item.TransactionId = transactionId;

                try
                {
                    await _repository.SaveChangesAsync();
                }
                catch (DbUpdateException ex) when (IsTransactionLinkRace(ex))
                {
                    return BudgetItemLinkOutcome.Of(BudgetItemLinkOutcomeStatus.TransactionAlreadyLinked, itemId, transactionId);
                }

                return BudgetItemLinkOutcome.Of(BudgetItemLinkOutcomeStatus.Linked, itemId, transactionId);
            });
        }

        /// <summary>
        /// Gastos del mes de la partida que comparten su alcance y todavía no están enlazados a
        /// ninguna partida. Es la lista que la UI ofrece para elegir a mano; el monto no filtra:
        /// el gasto real puede diferir del planificado. <c>null</c> cuando la partida no existe o no
        /// es del usuario (404, sin oráculo de existencia).
        /// </summary>
        public async Task<IReadOnlyList<BudgetItemLinkCandidate>?> ListBudgetItemLinkCandidatesAsync(int userId, int itemId, CancellationToken cancellationToken)
        {
            var item = await _repository.Get<BudgetItem>(i => i.ItemId == itemId && i.UserId == userId)
                .Select(i => new
                {
                    i.ItemId,
                    i.Kind,
                    i.PeriodKey,
                    i.CategoryId,
                    i.SubcategoryId
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (item == null)
            {
                return null;
            }

            var (_, _, startUtc, nextStartUtc) = MonthRangeResolver.ResolveUtcRange(item.PeriodKey, null);
            var kind = (item.Kind ?? string.Empty).Trim().ToLowerInvariant();

            // kind en vez de type: budget_items.kind y transactions.type son columnas distintas y se
            // comparan ignorando mayúsculas en memoria, así que SQL baja a minúsculas para coincidir.
            var transactions = _repository.Get<Transaction>(t =>
                t.Account.UserId == userId &&
                t.TransactionDate >= startUtc &&
                t.TransactionDate < nextStartUtc &&
                t.Type.ToLower() == kind &&
                !_repository.Get<BudgetItem>().Any(linked => linked.TransactionId == t.TransactionId));

            if (item.SubcategoryId.HasValue)
            {
                transactions = transactions.Where(t => t.SubcategoryId == item.SubcategoryId); // alcance-por-referencia: correlación por TransactionId dentro de una consulta ya acotada por t.Account.UserId == userId.
            }
            else if (item.CategoryId.HasValue)
            {
                transactions = transactions.Where(t => t.CategoryId == item.CategoryId);
            }
            else
            {
                // El XOR de ck_budget_items_scope garantiza que una partida trae categoría o
                // subcategoría; sin alcance no hay candidata válida.
                return Array.Empty<BudgetItemLinkCandidate>();
            }

            return await transactions
                .OrderByDescending(t => t.TransactionDate)
                .Select(t => new BudgetItemLinkCandidate
                {
                    TransactionId = t.TransactionId,
                    Amount = t.Amount,
                    TransactionDate = t.TransactionDate,
                    CategoryId = t.CategoryId,
                    SubcategoryId = t.SubcategoryId,
                    Description = t.Description
                })
                .ToListAsync(cancellationToken);
        }

        public Task<(Transaction? Transaction, string? ErrorMessage)> UpdateTransactionWithDetailsForUserAsync(
            int id,
            int userId,
            Transaction transaction,
            IEnumerable<string>? tags,
            IEnumerable<ExpenseAllocationInput>? allocations,
            bool replaceAllocations)
        {
            return _repository.ExecuteInTransactionAsync(async () =>
            {
                var transactionAccount = await _repository.Get<Transaction>(t => t.TransactionId == id)
                    .Select(t => new { t.AccountId, t.Account.UserId })
                    .FirstOrDefaultAsync();
                if (transactionAccount == null || transactionAccount.UserId != userId)
                {
                    return ((Transaction?)null, "Transaction not found");
                }

                var lockedAccounts = await _repository.LockAccountsAsync([transactionAccount.AccountId]);
                if (lockedAccounts.Count != 1 || lockedAccounts[0].UserId != userId)
                {
                    return ((Transaction?)null, "Transaction not found");
                }

                var existing = await _repository.LockTransactionAsync(id);
                if (existing == null || existing.AccountId != transactionAccount.AccountId)
                {
                    return ((Transaction?)null, "Transaction not found");
                }

                if (transaction.Amount <= 0)
                {
                    throw new ArgumentException("El monto de la transacción debe ser mayor a cero");
                }

                var requiredCategoryType = existing.Type.ToLowerInvariant() switch
                {
                    TransactionDomainConstants.TransactionType.Income => TransactionDomainConstants.TransactionType.Income,
                    TransactionDomainConstants.TransactionType.Expense or TransactionDomainConstants.TransactionType.OpeningCredit => TransactionDomainConstants.TransactionType.Expense,
                    _ => null
                };
                var dimensionsValidation = await _validation.ValidateAnalyticsDimensionsAsync(
                    userId,
                    transaction.CategoryId,
                    transaction.SubcategoryId,
                    transaction.MerchantId,
                    requiredCategoryType);
                if (!dimensionsValidation.IsValid)
                {
                    throw new ArgumentException(dimensionsValidation.ErrorMessage ?? "Dimensiones analíticas inválidas");
                }

                if (existing.Type == TransactionDomainConstants.TransactionType.Income && existing.Amount != transaction.Amount)
                {
                    var hasCreditPayment = await _repository.Get<CreditPayment>(p => p.SourceTransactionId == id).AnyAsync();
                    if (hasCreditPayment)
                    {
                        throw new ArgumentException("No se puede actualizar el monto de un ingreso aplicado como pago de crédito");
                    }
                }

                var expenseAmountOrDateChanged = existing.Type is TransactionDomainConstants.TransactionType.Expense or TransactionDomainConstants.TransactionType.OpeningCredit &&
                    (existing.Amount != transaction.Amount ||
                     _validation.EnsureUtc(existing.TransactionDate) != _validation.EnsureUtc(transaction.TransactionDate));
                if (expenseAmountOrDateChanged)
                {
                    var hasInstallmentAllocations = await _repository.Get<CreditCharge>(c => c.SourceTransactionId == id)
                        .SelectMany(c => c.InstallmentPlan!.Installments)
                        .SelectMany(i => i.Allocations)
                        .AnyAsync();
                    if (hasInstallmentAllocations)
                    {
                        throw new ArgumentException("No se puede actualizar el monto o fecha de un gasto de crédito con pagos asignados");
                    }
                }

                var updated = await UpdateInternalAsync(id, transaction, existing);
                if (tags != null)
                {
                    await _tagService.SyncTransactionTagsAsync(id, userId, tags);
                }

                if (replaceAllocations)
                {
                    var allocationResult = await _allocationService.ReplaceExpenseAllocationsAsync(id, userId, allocations, true);
                    if (!allocationResult.Success)
                    {
                        throw new ArgumentException(allocationResult.ErrorMessage ?? "Invalid expense allocation");
                    }
                }

                return (updated, (string?)null);
            });
        }

        public Task<bool> DeleteForUserAsync(int id, int userId)
        {
            return _repository.ExecuteInTransactionAsync(async () =>
            {
                var transactionAccount = await _repository.Get<Transaction>(t => t.TransactionId == id)
                    .Select(t => new { t.AccountId, t.Account.UserId })
                    .FirstOrDefaultAsync();
                if (transactionAccount == null || transactionAccount.UserId != userId) return false;

                var lockedAccounts = await _repository.LockAccountsAsync([transactionAccount.AccountId]);
                if (lockedAccounts.Count != 1 || lockedAccounts[0].UserId != userId) return false;

                var transaction = await _repository.LockTransactionAsync(id);
                if (transaction == null || transaction.AccountId != transactionAccount.AccountId || IsTransfer(transaction)) return false;

                return await DeleteInternalAsync(id, transaction);
            });
        }

        private static bool IsTransfer(Transaction transaction)
        {
            return string.Equals(transaction.Type, TransactionDomainConstants.TransactionType.Transfer, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Hook <b>post-commit</b> del matching de partidas (plan §4.4). Se invoca después de que
        /// <c>ExecuteInTransactionAsync</c> confirmó el alta, nunca dentro: enlazar aquí convertiría
        /// un fallo de matching en un rollback del gasto, y el gasto ya es un hecho. Por eso el
        /// <c>try/catch</c> es total —un problema del matching nunca rompe ni revierte el alta— y el
        /// log solo lleva el tipo de excepción y el id, nunca montos, nombres ni descripciones.
        /// </summary>
        /// <remarks>
        /// Cuando el alta corre dentro de una transacción de otro (importación de Bancoppel, motor de
        /// programados, confirmación de Telegram) no se hace nada: <c>ExecuteInTransactionAsync</c> es
        /// reentrante y no hubo commit propio, así que "post-commit" sería una mentira y el enlace
        /// caería dentro de la transacción ajena. Esas partidas se enlazan por su propio camino —el
        /// motor las enlaza él mismo— o quedan disponibles para la UI.
        /// </remarks>
        private async Task TryMatchBudgetItemsAsync(int transactionId, int userId)
        {
            if (_repository.IsInTransaction)
            {
                return;
            }

            try
            {
                var outcome = await _budgetItemMatchService.TryMatchTransactionAsync(
                    userId,
                    transactionId,
                    CancellationToken.None);

                if (outcome.Status == BudgetItemMatchOutcomeStatus.Linked)
                {
                    _logger.LogInformation(
                        "Budget item {ItemId} matched transaction {TransactionId}",
                        outcome.ItemId,
                        transactionId);
                }
            }
            catch (Exception ex)
            {
                // El gasto ya está confirmado: aquí solo se registra el tipo de fallo y se sigue.
                // El matching es best-effort y la partida seguirá pending y visible en la UI.
                //
                // La excepción NO se entrega al logger. LogError(ex, …) vuelca el mensaje, la pila y
                // las excepciones internas, y el mensaje de este servicio puede llevar lo que la
                // transacción traía —monto, comercio, descripción— si el fallo nació abajo. Solo el
                // tipo: dice qué se rompió sin decir de qué gasto era.
                _logger.LogError(
                    "Budget item matching failed for transaction {TransactionId} ({ExceptionType}); the transaction stays committed",
                    transactionId,
                    ex.GetType().Name);
            }
        }

        /// <summary>
        /// Enlace explícito post-commit de un alta "desde partida". Sigue la misma reserva que el
        /// matching automático: nada dentro de una transacción ajena (el alta ya la cerró) y un
        /// fallo nunca revierte el gasto. La elegibilidad ya se validó antes de escribir, así que
        /// aquí solo se registra el desenlace; el id no se pierde porque la partida sigue visible.
        /// </summary>
        private async Task TryLinkBudgetItemAfterCreateAsync(int budgetItemId, int transactionId, int userId)
        {
            if (_repository.IsInTransaction)
            {
                return;
            }

            try
            {
                var outcome = await LinkBudgetItemAsync(userId, budgetItemId, transactionId, CancellationToken.None);
                if (outcome.Status == BudgetItemLinkOutcomeStatus.Linked)
                {
                    _logger.LogInformation(
                        "Budget item {ItemId} linked transaction {TransactionId} by explicit request",
                        outcome.ItemId,
                        transactionId);
                    return;
                }

                _logger.LogWarning(
                    "Explicit budget item link did not apply for transaction {TransactionId}: {Status}",
                    transactionId,
                    outcome.Status);
            }
            catch (Exception ex)
            {
                // Mismo criterio que el matching: solo el tipo de excepción, nunca montos ni nombres.
                _logger.LogError(
                    "Explicit budget item link failed for transaction {TransactionId} ({ExceptionType}); the transaction stays committed",
                    transactionId,
                    ex.GetType().Name);
            }
        }

        /// <summary>
        /// Validación previa al alta "desde partida": existe, es del usuario, está <c>pending</c>,
        /// sin transacción, y coincide en mes, tipo y alcance con el gasto que se va a crear. Se
        /// lanza <see cref="ArgumentException"/> (400) para que la entrada inválida no deje gasto.
        /// </summary>
        private async Task ValidateBudgetItemLinkForNewExpenseAsync(
            int userId,
            int budgetItemId,
            int? categoryId,
            int? subcategoryId,
            DateTime transactionDateUtc)
        {
            var item = await _repository.Get<BudgetItem>(i => i.ItemId == budgetItemId && i.UserId == userId)
                .Select(i => new
                {
                    i.ItemId,
                    i.Kind,
                    i.PeriodKey,
                    i.CategoryId,
                    i.SubcategoryId,
                    i.Status,
                    i.TransactionId
                })
                .FirstOrDefaultAsync();

            if (item == null)
            {
                throw new ArgumentException("La partida indicada no existe.");
            }

            if (item.Status != BudgetItemStatus.Pending || item.TransactionId.HasValue)
            {
                throw new ArgumentException("La partida ya no está pendiente; recarga las partidas e inténtalo de nuevo.");
            }

            var reason = EvaluateLinkEligibility(
                item.Kind,
                item.PeriodKey,
                item.CategoryId,
                item.SubcategoryId,
                TransactionDomainConstants.TransactionType.Expense,
                categoryId,
                subcategoryId,
                transactionDateUtc);

            if (reason != null)
            {
                throw new ArgumentException("El gasto debe estar en el mes y la categoría/subcategoría de la partida.");
            }
        }

        /// <summary>
        /// Regla pura del enlace manual y del alta "desde partida": <b>mismo mes</b>, <b>mismo tipo</b>
        /// y <b>mismo alcance</b>. El monto es intencionalmente libre: el real manda una vez enlazado.
        /// La fecha de la transacción se resuelve al día local antes de derivar el periodo.
        /// </summary>
        private static BudgetItemLinkOutcomeStatus? EvaluateLinkEligibility(
            string itemKind,
            string itemPeriodKey,
            int? itemCategoryId,
            int? itemSubcategoryId,
            string transactionType,
            int? transactionCategoryId,
            int? transactionSubcategoryId,
            DateTime transactionDateUtc)
        {
            if (!string.Equals(itemKind?.Trim(), transactionType?.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                return BudgetItemLinkOutcomeStatus.Mismatch;
            }

            var periodKey = MonthRangeResolver.ToPeriodKey(MonthRangeResolver.ResolveLocalDate(transactionDateUtc));
            if (!string.Equals(itemPeriodKey, periodKey, StringComparison.Ordinal))
            {
                return BudgetItemLinkOutcomeStatus.Mismatch;
            }

            if (itemSubcategoryId.HasValue)
            {
                return itemSubcategoryId == transactionSubcategoryId
                    ? null
                    : BudgetItemLinkOutcomeStatus.Mismatch;
            }

            if (itemCategoryId.HasValue)
            {
                return itemCategoryId == transactionCategoryId
                    ? null
                    : BudgetItemLinkOutcomeStatus.Mismatch;
            }

            return BudgetItemLinkOutcomeStatus.Mismatch;
        }

        /// <summary>
        /// Carrera sobre <c>uq_budget_items_transaction</c>, reconocida por nombre porque el índice
        /// vive solo en SQL.
        /// </summary>
        private static bool IsTransactionLinkRace(DbUpdateException ex)
        {
            return ex.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: BudgetItemTransactionUniqueIndexName
            };
        }

        /// <summary>
        /// Categorización best-effort: si una regla falla o el destino ya no es válido, el gasto
        /// se registra sin categoría. Un error aquí nunca debe interpretarse como pérdida de escritura.
        /// </summary>
        private async Task TryApplyCatalogRuleAsync(Transaction transaction, int userId)
        {
            try
            {
                var resolution = await _catalogRuleService.ResolveAsync(userId, transaction.Description);
                if (resolution == null)
                {
                    return;
                }

                transaction.CategoryId = resolution.CategoryId;
                transaction.SubcategoryId = resolution.SubcategoryId;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "No se pudo resolver la regla de categorización para el usuario {UserId}", userId);
            }
        }

        private async Task<Transaction?> UpdateInternalAsync(int id, Transaction transaction, Transaction existing)
        {
            transaction.TransactionDate = _validation.EnsureUtc(transaction.TransactionDate);
            var expenseAmountOrDateChanged = transaction.Type is TransactionDomainConstants.TransactionType.Expense or TransactionDomainConstants.TransactionType.OpeningCredit &&
                (existing.Amount != transaction.Amount ||
                 _validation.EnsureUtc(existing.TransactionDate) != transaction.TransactionDate);

            var previousImpact = existing.BalanceImpact;
            if (previousImpact == 0)
            {
                previousImpact = await _validation.InferLegacyBalanceImpactAsync(existing);
            }

            transaction.BalanceImpact = _validation.ResolveUpdatedBalanceImpact(transaction, previousImpact);
            transaction.Direction = _validation.ResolveDirection(transaction.BalanceImpact);
            if (transaction.Type != TransactionDomainConstants.TransactionType.Transfer)
            {
                transaction.CounterpartyAccountId = null;
            }

            transaction.TransactionId = id;
            var result = await _repository.SaveUpdate(id, transaction);

            var adjustment = transaction.BalanceImpact - previousImpact;
            if (adjustment != 0)
            {
                await UpdateAccountBalanceAsync(existing.AccountId, adjustment);
            }

            if (expenseAmountOrDateChanged)
            {
                await _creditLifecycleService.SynchronizeCreditChargePlanAsync(id, transaction.Amount, transaction.TransactionDate);
            }

            return result;
        }

        private async Task<bool> DeleteInternalAsync(int id, Transaction transaction)
        {
            if (transaction.Type is TransactionDomainConstants.TransactionType.Expense or TransactionDomainConstants.TransactionType.OpeningCredit)
            {
                var hasInstallmentAllocations = await _repository.Get<CreditCharge>(c => c.SourceTransactionId == id)
                    .SelectMany(c => c.InstallmentPlan!.Installments)
                    .SelectMany(i => i.Allocations)
                    .AnyAsync();
                if (hasInstallmentAllocations)
                {
                    throw new ArgumentException("No se puede eliminar una transacción cargada a crédito con pagos aplicados");
                }
            }

            var paymentResult = await _creditLifecycleService.ReverseCreditPaymentSourceAsync(id);
            if (!paymentResult.Success)
            {
                throw new ArgumentException(paymentResult.ErrorMessage ?? "No se pudo revertir el pago de crédito");
            }

            var balanceImpact = transaction.BalanceImpact;
            if (balanceImpact == 0)
            {
                balanceImpact = await _validation.InferLegacyBalanceImpactAsync(transaction);
            }

            await UpdateAccountBalanceAsync(transaction.AccountId, balanceImpact * -1);
            var result = await _repository.RemoveAsync(transaction);
            return result == 1;
        }

        private async Task UpdateAccountBalanceAsync(int accountId, decimal amount)
        {
            var updated = await _repository.UpdateAccountBalanceAsync(accountId, amount, amount < 0);
            if (!updated)
            {
                throw new ArgumentException(amount < 0
                    ? "Saldo insuficiente en la cuenta"
                    : $"Account with ID {accountId} not found");
            }
        }
    }
}
