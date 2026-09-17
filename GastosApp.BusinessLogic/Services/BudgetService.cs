using System.Globalization;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// Presupuestos mensuales: CRUD, umbrales con historial preservado y estado de consumo.
    /// El estado solo se calcula; el evaluador de alertas vive en otro servicio.
    /// </summary>
    public class BudgetService : IBudgetService
    {
        private const int MaxThresholds = 10;

        // Índice único de presupuesto por (usuario, periodo, scope). Es un índice de expresión,
        // por eso solo existe en SQL y hay que reconocerlo por su nombre en el error de Postgres.
        private const string ScopeUniqueIndexName = "ux_budgets_user_period_scope";
        private const string ScopeConflictMessage = "A budget already exists for this period and scope.";

        private const string StatusOk = "ok";
        private const string StatusWarning = "warning";
        private const string StatusExceeded = "exceeded";

        private readonly IRepository _repository;

        public BudgetService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<IReadOnlyList<Budget>> ListAsync(int userId, string? periodKey = null)
        {
            var query = _repository.Get<Budget>(b => b.UserId == userId);

            if (!string.IsNullOrWhiteSpace(periodKey))
            {
                var normalized = NormalizePeriodKey(periodKey);
                query = query.Where(b => b.PeriodKey == normalized);
            }

            return await query
                .Include(b => b.Thresholds)
                .OrderByDescending(b => b.PeriodKey)
                .ThenBy(b => b.Name)
                .ToListAsync();
        }

        public async Task<Budget?> GetAsync(int id, int userId)
        {
            return await _repository.Get<Budget>(b => b.BudgetId == id && b.UserId == userId)
                .Include(b => b.Thresholds)
                .FirstOrDefaultAsync();
        }

        public async Task<Budget> CreateAsync(int userId, BudgetWriteInput input)
        {
            if (input == null) throw new ArgumentException("Budget input is required.", nameof(input));

            var periodKey = NormalizePeriodKey(input.PeriodKey);
            var name = NormalizeName(input.Name, 120, "Budget name");
            var amount = NormalizeAmount(input.AmountMxn);
            var (categoryId, subcategoryId) = await ValidateScopeAsync(userId, input.CategoryId, input.SubcategoryId);
            var thresholds = NormalizeThresholds(input.Thresholds, useDefaultsWhenEmpty: true);

            await EnsureScopeAvailableAsync(userId, periodKey, categoryId, subcategoryId, excludeBudgetId: null);

            try
            {
                return await _repository.ExecuteInTransactionAsync(async () =>
                {
                    var budget = new Budget
                    {
                        UserId = userId,
                        PeriodKey = periodKey,
                        Name = name,
                        CategoryId = categoryId,
                        SubcategoryId = subcategoryId,
                        AmountMxn = amount,
                        Active = true
                    };

                    await _repository.Save(budget);

                    foreach (var threshold in thresholds)
                    {
                        await _repository.Save(new BudgetThreshold
                        {
                            BudgetId = budget.BudgetId,
                            Name = threshold.Name,
                            Percent = threshold.Percent,
                            Active = threshold.Active
                        });
                    }

                    return (await GetAsync(budget.BudgetId, userId)) ?? budget;
                });
            }
            catch (DbUpdateException ex) when (IsScopeCollision(ex))
            {
                throw new ArgumentException(ScopeConflictMessage, nameof(input));
            }
        }

        public async Task<Budget?> UpdateAsync(int id, int userId, BudgetWriteInput input)
        {
            if (input == null) throw new ArgumentException("Budget input is required.", nameof(input));

            var budget = await _repository.GetTrack<Budget>()
                .FirstOrDefaultAsync(b => b.BudgetId == id && b.UserId == userId);

            if (budget == null)
            {
                return null;
            }

            if (!string.IsNullOrWhiteSpace(input.PeriodKey) &&
                !string.Equals(input.PeriodKey, budget.PeriodKey, StringComparison.Ordinal))
            {
                throw new ArgumentException("periodKey cannot be changed.");
            }

            var name = NormalizeName(input.Name, 120, "Budget name");
            var amount = NormalizeAmount(input.AmountMxn);
            var (categoryId, subcategoryId) = await ValidateScopeAsync(userId, input.CategoryId, input.SubcategoryId);

            await EnsureScopeAvailableAsync(userId, budget.PeriodKey, categoryId, subcategoryId, excludeBudgetId: id);

            budget.Name = name;
            budget.AmountMxn = amount;
            budget.CategoryId = categoryId;
            budget.SubcategoryId = subcategoryId;

            try
            {
                await _repository.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (IsScopeCollision(ex))
            {
                throw new ArgumentException(ScopeConflictMessage, nameof(input));
            }

            return await GetAsync(id, userId);
        }

        public async Task<bool> SetActiveAsync(int id, int userId, bool active)
        {
            var budget = await _repository.GetTrack<Budget>()
                .FirstOrDefaultAsync(b => b.BudgetId == id && b.UserId == userId);

            if (budget == null)
            {
                return false;
            }

            budget.Active = active;
            await _repository.SaveChangesAsync();
            return true;
        }

        public async Task<Budget?> ReplaceThresholdsAsync(int id, int userId, IReadOnlyList<BudgetThresholdInput> thresholds)
        {
            if (thresholds == null) throw new ArgumentException("Thresholds collection is required.", nameof(thresholds));

            var budget = await _repository.GetTrack<Budget>()
                .FirstOrDefaultAsync(b => b.BudgetId == id && b.UserId == userId);

            if (budget == null)
            {
                return null;
            }

            var desired = NormalizeThresholds(thresholds, useDefaultsWhenEmpty: false);

            return await _repository.ExecuteInTransactionAsync(async () =>
            {
                var current = await _repository.GetTrack<BudgetThreshold>()
                    .Where(t => t.BudgetId == id)
                    .ToListAsync();

                // Un umbral con entregas es historial inmutable: no se borra ni se renombra.
                var lockedIds = await _repository.Get<AlertDelivery>(d => d.BudgetId == id)
                    .Select(d => d.ThresholdId)
                    .Distinct()
                    .ToListAsync();
                var locked = lockedIds.ToHashSet();

                var desiredByPercent = desired.ToDictionary(t => t.Percent);

                foreach (var existing in current)
                {
                    if (!desiredByPercent.TryGetValue(existing.Percent, out var target))
                    {
                        if (locked.Contains(existing.ThresholdId))
                        {
                            throw new ArgumentException("Cannot remove a threshold that already has alert deliveries.");
                        }

                        continue;
                    }

                    if (locked.Contains(existing.ThresholdId) &&
                        !string.Equals(existing.Name, target.Name, StringComparison.Ordinal))
                    {
                        throw new ArgumentException("Cannot modify a threshold that already has alert deliveries.");
                    }
                }

                var existingPercents = current.Select(t => t.Percent).ToHashSet();

                foreach (var existing in current)
                {
                    if (desiredByPercent.TryGetValue(existing.Percent, out var target))
                    {
                        if (!locked.Contains(existing.ThresholdId))
                        {
                            existing.Name = target.Name;
                        }

                        // Activar/desactivar nunca altera el historial ya notificado.
                        existing.Active = target.Active;
                        continue;
                    }

                    await _repository.RemoveAsync(existing);
                }

                foreach (var target in desired.Where(t => !existingPercents.Contains(t.Percent)))
                {
                    await _repository.Save(new BudgetThreshold
                    {
                        BudgetId = id,
                        Name = target.Name,
                        Percent = target.Percent,
                        Active = target.Active
                    });
                }

                await _repository.SaveChangesAsync();

                return await GetAsync(id, userId) ?? budget;
            });
        }

        public async Task<BudgetStatusResult?> GetStatusAsync(int id, int userId)
        {
            var budget = await _repository.Get<Budget>(b => b.BudgetId == id && b.UserId == userId)
                .Include(b => b.Thresholds)
                .FirstOrDefaultAsync();

            if (budget == null)
            {
                return null;
            }

            var spent = await GetSpentAsync(userId, budget.PeriodKey, budget.CategoryId, budget.SubcategoryId);
            return BuildStatus(budget, spent);
        }

        public async Task<IReadOnlyList<BudgetStatusResult>> GetPeriodStatusAsync(int userId, string? periodKey = null)
        {
            var (year, month, _, _) = MonthRangeResolver.ResolveUtcRange(periodKey, null);
            var effectivePeriod = $"{year:D4}-{month:D2}";

            var budgets = await _repository.Get<Budget>(b => b.UserId == userId && b.PeriodKey == effectivePeriod)
                .Include(b => b.Thresholds)
                .OrderBy(b => b.Name)
                .ToListAsync();

            var results = new List<BudgetStatusResult>(budgets.Count);
            foreach (var budget in budgets)
            {
                var spent = await GetSpentAsync(userId, budget.PeriodKey, budget.CategoryId, budget.SubcategoryId);
                results.Add(BuildStatus(budget, spent));
            }

            return results;
        }

        /// <summary>Suma el gasto del periodo. Presupuesto por categoría incluye sus subcategorías.</summary>
        private async Task<decimal> GetSpentAsync(int userId, string periodKey, int? categoryId, int? subcategoryId)
        {
            var (_, _, startUtc, nextStartUtc) = MonthRangeResolver.ResolveUtcRange(periodKey, null);

            var total = await _repository.Get<Transaction>(t =>
                    t.Account.UserId == userId &&
                    t.Type == TransactionDomainConstants.TransactionType.Expense &&
                    t.TransferGroupId == null &&
                    t.TransactionDate >= startUtc &&
                    t.TransactionDate < nextStartUtc &&
                    (categoryId == null || t.CategoryId == categoryId) &&
                    (subcategoryId == null || t.SubcategoryId == subcategoryId))
                .SumAsync(t => (decimal?)t.Amount);

            return RoundMoney(total ?? 0m);
        }

        private static BudgetStatusResult BuildStatus(Budget budget, decimal spent)
        {
            var amount = RoundMoney(budget.AmountMxn);
            var percentUsed = amount > 0m
                ? Math.Round(spent / amount * 100m, 2, MidpointRounding.AwayFromZero)
                : 0m;

            var activeThresholds = budget.Thresholds
                .Where(t => t.Active)
                .OrderBy(t => t.Percent)
                .ToList();

            var reached = activeThresholds.LastOrDefault(t => t.Percent <= percentUsed);

            string status;
            if (activeThresholds.Count == 0)
            {
                status = percentUsed >= 100m ? StatusExceeded : StatusOk;
            }
            else if (percentUsed < activeThresholds[0].Percent)
            {
                status = StatusOk;
            }
            else if (percentUsed >= 100m || percentUsed >= activeThresholds[^1].Percent)
            {
                status = StatusExceeded;
            }
            else
            {
                status = StatusWarning;
            }

            return new BudgetStatusResult
            {
                BudgetId = budget.BudgetId,
                Name = budget.Name,
                PeriodKey = budget.PeriodKey,
                CategoryId = budget.CategoryId,
                SubcategoryId = budget.SubcategoryId,
                Active = budget.Active,
                AmountMxn = amount,
                Spent = spent,
                Remaining = RoundMoney(amount - spent),
                PercentUsed = percentUsed,
                Status = status,
                ReachedThreshold = reached == null
                    ? null
                    : new BudgetThresholdStatusItem
                    {
                        ThresholdId = reached.ThresholdId,
                        Name = reached.Name,
                        Percent = reached.Percent
                    }
            };
        }

        private async Task<(int? CategoryId, int? SubcategoryId)> ValidateScopeAsync(int userId, int? categoryId, int? subcategoryId)
        {
            if (categoryId.HasValue == subcategoryId.HasValue)
            {
                throw new ArgumentException("Budget scope must be exactly one of categoryId or subcategoryId.");
            }

            if (categoryId.HasValue)
            {
                var category = await _repository.Get<Category>(c =>
                        c.CategoryId == categoryId.Value && (c.UserId == userId || c.UserId == null))
                    .FirstOrDefaultAsync();

                if (category == null)
                {
                    throw new ArgumentException("Category not found or not accessible.");
                }

                if (!string.Equals(category.Type, TransactionDomainConstants.TransactionType.Expense, StringComparison.OrdinalIgnoreCase))
                {
                    throw new ArgumentException("Budget category must be of type expense.");
                }

                return (categoryId, null);
            }

            var subcategory = await _repository.Get<Subcategory>(s =>
                    s.SubcategoryId == subcategoryId!.Value && (s.UserId == userId || s.UserId == null))
                .FirstOrDefaultAsync();

            if (subcategory == null)
            {
                throw new ArgumentException("Subcategory not found or not accessible.");
            }

            var parent = await _repository.Get<Category>(c => c.CategoryId == subcategory.CategoryId)
                .FirstOrDefaultAsync();

            if (parent == null ||
                !string.Equals(parent.Type, TransactionDomainConstants.TransactionType.Expense, StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException("Budget subcategory must belong to an expense category.");
            }

            return (null, subcategoryId);
        }

        private async Task EnsureScopeAvailableAsync(int userId, string periodKey, int? categoryId, int? subcategoryId, int? excludeBudgetId)
        {
            var exists = await _repository.Get<Budget>(b =>
                    b.UserId == userId &&
                    b.PeriodKey == periodKey &&
                    b.CategoryId == categoryId &&
                    b.SubcategoryId == subcategoryId &&
                    (excludeBudgetId == null || b.BudgetId != excludeBudgetId))
                .AnyAsync();

            if (exists)
            {
                throw new ArgumentException(ScopeConflictMessage);
            }
        }

        /// <summary>
        /// Carrera entre dos altas/ediciones concurrentes: el chequeo previo pasó, pero el índice
        /// único rechazó la escritura. Se traduce a error de dominio en vez de 500.
        /// </summary>
        private static bool IsScopeCollision(DbUpdateException ex)
        {
            return ex.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: ScopeUniqueIndexName
            };
        }

        private static string NormalizePeriodKey(string? periodKey)
        {
            if (string.IsNullOrWhiteSpace(periodKey) ||
                !DateTime.TryParseExact(periodKey, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            {
                throw new ArgumentException("periodKey must use yyyy-MM format.", nameof(periodKey));
            }

            return periodKey!;
        }

        private static string NormalizeName(string? value, int maxLength, string label)
        {
            var name = value?.Trim() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException($"{label} is required.");
            }

            if (name.Length > maxLength)
            {
                throw new ArgumentException($"{label} cannot exceed {maxLength} characters.");
            }

            return name;
        }

        private static decimal NormalizeAmount(decimal amount)
        {
            var rounded = RoundMoney(amount);
            if (rounded <= 0m)
            {
                throw new ArgumentException("amountMxn must be greater than zero.");
            }

            return rounded;
        }

        private static List<BudgetThresholdInput> NormalizeThresholds(IReadOnlyList<BudgetThresholdInput>? thresholds, bool useDefaultsWhenEmpty)
        {
            if (thresholds == null || thresholds.Count == 0)
            {
                if (!useDefaultsWhenEmpty)
                {
                    return new List<BudgetThresholdInput>();
                }

                thresholds = new List<BudgetThresholdInput>
                {
                    new() { Name = "Aviso", Percent = 80m, Active = true },
                    new() { Name = "Límite", Percent = 100m, Active = true }
                };
            }

            if (thresholds.Count > MaxThresholds)
            {
                throw new ArgumentException($"A budget cannot have more than {MaxThresholds} thresholds.");
            }

            var result = new List<BudgetThresholdInput>(thresholds.Count);
            var seenPercents = new HashSet<decimal>();

            foreach (var threshold in thresholds)
            {
                var percent = Math.Round(threshold.Percent, 2, MidpointRounding.AwayFromZero);

                if (percent <= 0m)
                {
                    throw new ArgumentException("Threshold percent must be greater than zero.");
                }

                if (percent > 999.99m)
                {
                    throw new ArgumentException("Threshold percent cannot exceed 999.99.");
                }

                if (!seenPercents.Add(percent))
                {
                    throw new ArgumentException($"Duplicate threshold percent {percent}.");
                }

                result.Add(new BudgetThresholdInput
                {
                    Name = NormalizeName(threshold.Name, 60, "Threshold name"),
                    Percent = percent,
                    Active = threshold.Active
                });
            }

            return result;
        }

        private static decimal RoundMoney(decimal value)
        {
            return Math.Round(value, 2, MidpointRounding.AwayFromZero);
        }
    }
}
