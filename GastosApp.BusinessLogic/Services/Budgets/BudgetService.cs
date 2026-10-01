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
        private readonly BudgetEvaluationSettings _settings;

        public BudgetService(IRepository repository, BudgetEvaluationSettings settings)
        {
            _repository = repository;
            _settings = settings;
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

            // Mismo camino por-scope que el listado del periodo: así el scope de un solo presupuesto
            // nunca vuelve a resolverse con una regla distinta a la del resto.
            var statuses = await ComputeStatusesAsync(userId, budget.PeriodKey, new[] { budget });
            return statuses[0];
        }

        public async Task<IReadOnlyList<BudgetStatusResult>> GetPeriodStatusAsync(int userId, string? periodKey = null)
        {
            var (year, month, _, _) = MonthRangeResolver.ResolveUtcRange(periodKey, null);
            var effectivePeriod = $"{year:D4}-{month:D2}";

            var budgets = await _repository.Get<Budget>(b => b.UserId == userId && b.PeriodKey == effectivePeriod)
                .Include(b => b.Thresholds)
                .OrderBy(b => b.Name)
                .ToListAsync();

            if (budgets.Count == 0)
            {
                return Array.Empty<BudgetStatusResult>();
            }

            return await ComputeStatusesAsync(userId, effectivePeriod, budgets);
        }

        /// <summary>
        /// Calcula el estado de consumo de uno o varios presupuestos del mismo periodo con consultas
        /// agrupadas por scope. Es el camino único de cálculo: <see cref="GetStatusAsync"/> y
        /// <see cref="GetPeriodStatusAsync"/> comparten esta función para que el comprometido de un
        /// presupuesto por categoría incluya siempre las partidas de sus subcategorías (sección 4.8).
        /// </summary>
        private async Task<List<BudgetStatusResult>> ComputeStatusesAsync(int userId, string periodKey, IReadOnlyList<Budget> budgets)
        {
            // Un solo SUM agrupado por (categoría, subcategoría) sustituye los N SUM por presupuesto.
            var spentByScope = await GetSpentByScopeAsync(userId, periodKey);
            var committedByScope = await GetCommittedByScopeAsync(userId, periodKey);
            var totalsByScope = await GetItemTotalsByScopeAsync(userId, periodKey);

            // Una sola consulta resuelve el padre de cada subcategoría referenciada; el mapa se reutiliza
            // para todos los presupuestos del periodo.
            var parentBySubcategory = await GetSubcategoryParentMapAsync(
                CollectSubcategoryIds(committedByScope, totalsByScope));

            var results = new List<BudgetStatusResult>(budgets.Count);
            foreach (var budget in budgets)
            {
                var spent = ResolveSpent(spentByScope, budget.CategoryId, budget.SubcategoryId);
                var committed = ResolveCommitted(committedByScope, budget.CategoryId, budget.SubcategoryId, parentBySubcategory);
                var totals = ResolveItemTotals(totalsByScope, budget.CategoryId, budget.SubcategoryId, parentBySubcategory);
                results.Add(BuildStatus(budget, spent, committed, totals));
            }

            return results;
        }

        /// <summary>
        /// Gasto del periodo agrupado por (categoría, subcategoría). Una sola consulta cubre todos los
        /// presupuestos del periodo y <see cref="ResolveSpent"/> atribuye el scope más específico.
        /// </summary>
        private async Task<List<ScopeSpend>> GetSpentByScopeAsync(int userId, string periodKey)
        {
            var (_, _, startUtc, nextStartUtc) = MonthRangeResolver.ResolveUtcRange(periodKey, null);

            var rows = await _repository.Get<Transaction>(t =>
                    t.Account.UserId == userId &&
                    t.Type == TransactionDomainConstants.TransactionType.Expense &&
                    t.TransferGroupId == null &&
                    t.TransactionDate >= startUtc &&
                    t.TransactionDate < nextStartUtc)
                .GroupBy(t => new { t.CategoryId, t.SubcategoryId })
                .Select(g => new
                {
                    g.Key.CategoryId,
                    g.Key.SubcategoryId,
                    Total = g.Sum(t => (decimal?)t.Amount)
                })
                .ToListAsync();

            return rows
                .Select(r => new ScopeSpend(r.CategoryId, r.SubcategoryId, r.Total ?? 0m))
                .ToList();
        }

        /// <summary>
        /// Presupuesto por categoría incluye sus subcategorías; por subcategoría suma solo la suya.
        /// Ambos nulos solo aparece en datos legados sin scope: suma el periodo completo, igual que antes.
        /// </summary>
        private static decimal ResolveSpent(IReadOnlyList<ScopeSpend> spentByScope, int? categoryId, int? subcategoryId)
        {
            decimal total;

            if (subcategoryId.HasValue)
            {
                total = spentByScope.Where(r => r.SubcategoryId == subcategoryId).Sum(r => r.Total);
            }
            else if (categoryId.HasValue)
            {
                total = spentByScope.Where(r => r.CategoryId == categoryId).Sum(r => r.Total);
            }
            else
            {
                total = spentByScope.Sum(r => r.Total);
            }

            return RoundMoney(total);
        }

        /// <summary>
        /// Comprometido del periodo agrupado por (categoría, subcategoría): una sola consulta cubre
        /// todos los presupuestos del periodo, igual que <see cref="GetSpentByScopeAsync"/>.
        /// <c>period_key</c> se deriva de <c>planned_date</c>, así que no hace falta filtrar por fecha.
        /// Solo en periodos abiertos: al cerrar el mes, una partida <c>pending</c> deja de contar
        /// (caduca) y se reporta como <c>unexecuted</c>.
        /// </summary>
        private async Task<List<ScopeCommitted>> GetCommittedByScopeAsync(int userId, string periodKey)
        {
            if (!MonthRangeResolver.IsPeriodOpen(periodKey))
            {
                return new List<ScopeCommitted>();
            }

            var rows = await _repository.Get<BudgetItem>(i =>
                    i.UserId == userId &&
                    i.PeriodKey == periodKey &&
                    i.Kind == TransactionDomainConstants.TransactionType.Expense &&
                    (i.Status == BudgetItemStatus.Pending || i.Status == BudgetItemStatus.Ignored))
                .GroupBy(i => new { i.CategoryId, i.SubcategoryId })
                .Select(g => new
                {
                    g.Key.CategoryId,
                    g.Key.SubcategoryId,
                    Committed = g.Sum(i => i.IsProjected ? 0m : i.PlannedAmount),
                    Projected = g.Sum(i => i.IsProjected ? i.PlannedAmount : 0m)
                })
                .ToListAsync();

            return rows
                .Select(r => new ScopeCommitted(r.CategoryId, r.SubcategoryId, r.Committed, r.Projected))
                .ToList();
        }

        /// <summary>
        /// Mapa subcategoría → categoría padre. Una partida con <c>subcategory_id</c> cuenta tanto en el
        /// presupuesto de esa subcategoría como en el de su categoría padre, igual que el gasto real
        /// (sección 4.8). Sin este mapa, el comprometido de un presupuesto por categoría ignoraría las
        /// partidas de sus subcategorías porque <c>category_id</c> es nulo en ellas (<c>ck_budget_items_scope</c>).
        /// </summary>
        private async Task<Dictionary<int, int>> GetSubcategoryParentMapAsync(IReadOnlyCollection<int> subcategoryIds)
        {
            if (subcategoryIds.Count == 0)
            {
                return new Dictionary<int, int>();
            }

            // Una sola consulta para todas las subcategorías del periodo; el resultado se reutiliza por presupuesto.
            return await _repository.Get<Subcategory>(s => subcategoryIds.Contains(s.SubcategoryId))
                .Select(s => new { s.SubcategoryId, s.CategoryId })
                .ToDictionaryAsync(s => s.SubcategoryId, s => s.CategoryId);
        }

        /// <summary>
        /// Subcategorías referenciadas por las filas del comprometido y de los conteos del periodo.
        /// Se deduplican porque varias filas por <c>(categoría, subcategoría)</c> pueden compartir la misma.
        /// </summary>
        private static IReadOnlyCollection<int> CollectSubcategoryIds(
            IReadOnlyList<ScopeCommitted> committedByScope,
            IReadOnlyList<ScopeItemTotals> totalsByScope)
        {
            var ids = new HashSet<int>();

            foreach (var row in committedByScope)
            {
                if (row.SubcategoryId.HasValue)
                {
                    ids.Add(row.SubcategoryId.Value);
                }
            }

            foreach (var row in totalsByScope)
            {
                if (row.SubcategoryId.HasValue)
                {
                    ids.Add(row.SubcategoryId.Value);
                }
            }

            return ids;
        }

        /// <summary>
        /// Misma regla de scope más específico que <see cref="ResolveSpent"/>. Un presupuesto por
        /// categoría suma además las partidas de sus subcategorías, resueltas mediante
        /// <paramref name="parentBySubcategory"/> (sección 4.8): la partida de subcategoría tiene
        /// <c>category_id</c> nulo, así que sin el mapa nunca caería en el presupuesto de la categoría.
        /// </summary>
        private static ScopeCommitted ResolveCommitted(
            IReadOnlyList<ScopeCommitted> committedByScope,
            int? categoryId,
            int? subcategoryId,
            IReadOnlyDictionary<int, int> parentBySubcategory)
        {
            IEnumerable<ScopeCommitted> matching;

            if (subcategoryId.HasValue)
            {
                matching = committedByScope.Where(r => r.SubcategoryId == subcategoryId);
            }
            else if (categoryId.HasValue)
            {
                matching = committedByScope.Where(r =>
                    r.CategoryId == categoryId ||
                    (r.SubcategoryId.HasValue &&
                     parentBySubcategory.TryGetValue(r.SubcategoryId.Value, out var parent) &&
                     parent == categoryId.Value));
            }
            else
            {
                matching = committedByScope;
            }

            var rows = matching.ToList();
            return new ScopeCommitted(
                categoryId,
                subcategoryId,
                RoundMoney(rows.Sum(r => r.Committed)),
                RoundMoney(rows.Sum(r => r.Projected)));
        }

        /// <summary>
        /// Conteos y montos planificados del periodo agrupados por scope. Se calculan siempre, aunque
        /// el periodo esté cerrado: los conteos y el plan declarado no caducan, solo el comprometido.
        /// Incluye las partidas de ingreso (<c>plannedIncome</c>) porque ese bloque no se mezcla con
        /// los límites de gasto pero sí se reporta por presupuesto.
        /// Gating de ingresos: <c>committedIncome</c>/<c>projectedIncome</c> solo cuentan partidas
        /// <c>pending</c>. Una partida <c>executed</c> ya existe como transacción real y contarla aquí
        /// la duplicaría; una <c>ignored</c> significa "no llegó" y no debe contarse como esperado.
        /// Asimetría intencional con gasto, donde <c>ignored</c> sigue contando (sección 4.4 regla 6:
        /// "decidí no gastarlo", el dinero sigue reservado).
        /// </summary>
        private async Task<List<ScopeItemTotals>> GetItemTotalsByScopeAsync(int userId, string periodKey)
        {
            var rows = await _repository.Get<BudgetItem>(i =>
                    i.UserId == userId &&
                    i.PeriodKey == periodKey)
                .GroupBy(i => new { i.CategoryId, i.SubcategoryId })
                .Select(g => new
                {
                    g.Key.CategoryId,
                    g.Key.SubcategoryId,
                    Pending = g.Count(i => i.Status == BudgetItemStatus.Pending),
                    Executed = g.Count(i => i.Status == BudgetItemStatus.Executed),
                    Ignored = g.Count(i => i.Status == BudgetItemStatus.Ignored),
                    PlannedExpense = g.Sum(i => i.Kind == TransactionDomainConstants.TransactionType.Expense && i.Status != BudgetItemStatus.Cancelled
                        ? i.PlannedAmount
                        : 0m),
                    PlannedIncome = g.Sum(i => i.Kind == TransactionDomainConstants.TransactionType.Income && i.Status != BudgetItemStatus.Cancelled
                        ? i.PlannedAmount
                        : 0m),
                    CommittedIncome = g.Sum(i => i.Kind == TransactionDomainConstants.TransactionType.Income &&
                            i.Status == BudgetItemStatus.Pending &&
                            !i.IsProjected
                        ? i.PlannedAmount
                        : 0m),
                    ProjectedIncome = g.Sum(i => i.Kind == TransactionDomainConstants.TransactionType.Income &&
                            i.Status == BudgetItemStatus.Pending &&
                            i.IsProjected
                        ? i.PlannedAmount
                        : 0m)
                })
                .ToListAsync();

            return rows
                .Select(r => new ScopeItemTotals(
                    r.CategoryId,
                    r.SubcategoryId,
                    r.Pending,
                    r.Executed,
                    r.Ignored,
                    r.PlannedExpense,
                    r.PlannedIncome,
                    r.CommittedIncome,
                    r.ProjectedIncome))
                .ToList();
        }

        /// <summary>
        /// Misma regla de scope más específico que <see cref="ResolveSpent"/>: un presupuesto por
        /// categoría suma además las totales de sus subcategorías vía <paramref name="parentBySubcategory"/>.
        /// </summary>
        private static ScopeItemTotals ResolveItemTotals(
            IReadOnlyList<ScopeItemTotals> totalsByScope,
            int? categoryId,
            int? subcategoryId,
            IReadOnlyDictionary<int, int> parentBySubcategory)
        {
            IEnumerable<ScopeItemTotals> matching;

            if (subcategoryId.HasValue)
            {
                matching = totalsByScope.Where(r => r.SubcategoryId == subcategoryId);
            }
            else if (categoryId.HasValue)
            {
                matching = totalsByScope.Where(r =>
                    r.CategoryId == categoryId ||
                    (r.SubcategoryId.HasValue &&
                     parentBySubcategory.TryGetValue(r.SubcategoryId.Value, out var parent) &&
                     parent == categoryId.Value));
            }
            else
            {
                matching = totalsByScope;
            }

            var rows = matching.ToList();
            return new ScopeItemTotals(
                categoryId,
                subcategoryId,
                rows.Sum(r => r.Pending),
                rows.Sum(r => r.Executed),
                rows.Sum(r => r.Ignored),
                rows.Sum(r => r.PlannedExpense),
                rows.Sum(r => r.PlannedIncome),
                rows.Sum(r => r.CommittedIncome),
                rows.Sum(r => r.ProjectedIncome));
        }

        private sealed record ScopeSpend(int? CategoryId, int? SubcategoryId, decimal Total);

        private sealed record ScopeCommitted(int? CategoryId, int? SubcategoryId, decimal Committed, decimal Projected);

        private sealed record ScopeItemTotals(
            int? CategoryId,
            int? SubcategoryId,
            int Pending,
            int Executed,
            int Ignored,
            decimal PlannedExpense,
            decimal PlannedIncome,
            decimal CommittedIncome,
            decimal ProjectedIncome);

        private BudgetStatusResult BuildStatus(
            Budget budget,
            decimal spent,
            ScopeCommitted committed,
            ScopeItemTotals totals)
        {
            var amount = RoundMoney(budget.AmountMxn);
            var projected = RoundMoney(committed.Projected);
            var effective = RoundMoney(spent + committed.Committed);
            var forecast = RoundMoney(effective + projected);

            var spentPercent = PercentOf(spent, amount);
            var committedPercent = PercentOf(committed.Committed, amount);
            var projectedPercent = PercentOf(projected, amount);

            // El desglose mostrado compone el agregado; el umbral lo decide el interruptor.
            var percentUsed = RoundPercent(spentPercent + committedPercent);
            var thresholdPercent = _settings.CommittedCountsEnabled ? percentUsed : spentPercent;

            var activeThresholds = budget.Thresholds
                .Where(t => t.Active)
                .OrderBy(t => t.Percent)
                .ToList();

            var reached = activeThresholds.LastOrDefault(t => t.Percent <= thresholdPercent);

            string status;
            if (activeThresholds.Count == 0)
            {
                status = thresholdPercent >= 100m ? StatusExceeded : StatusOk;
            }
            else if (thresholdPercent < activeThresholds[0].Percent)
            {
                status = StatusOk;
            }
            else if (thresholdPercent >= 100m || thresholdPercent >= activeThresholds[^1].Percent)
            {
                status = StatusExceeded;
            }
            else
            {
                status = StatusWarning;
            }

            // Caducidad: en un periodo cerrado el comprometido vale cero y las partidas que siguen
            // pendientes se reportan como no ejecutadas. Los conteos y el plan declarado no caducan.
            var periodOpen = MonthRangeResolver.IsPeriodOpen(budget.PeriodKey);

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
                SpentPercent = spentPercent,
                Committed = committed.Committed,
                CommittedPercent = committedPercent,
                Projected = projected,
                ProjectedPercent = projectedPercent,
                Effective = effective,
                Forecast = forecast,
                PercentUsed = percentUsed,
                ThresholdPercent = thresholdPercent,
                Remaining = RoundMoney(amount - effective),
                PlannedAmount = RoundMoney(totals.PlannedExpense),
                Variance = RoundMoney(totals.PlannedExpense - spent),
                ItemsPending = totals.Pending,
                ItemsExecuted = totals.Executed,
                ItemsUnexecuted = periodOpen ? 0 : totals.Pending,
                ItemsIgnored = totals.Ignored,
                PlannedIncome = RoundMoney(totals.PlannedIncome),
                CommittedIncome = periodOpen ? RoundMoney(totals.CommittedIncome) : 0m,
                ProjectedIncome = periodOpen ? RoundMoney(totals.ProjectedIncome) : 0m,
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

        private static decimal PercentOf(decimal value, decimal amount)
        {
            if (amount <= 0m)
            {
                return 0m;
            }

            return RoundPercent(value / amount * 100m);
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

        private static decimal RoundPercent(decimal value)
        {
            return Math.Round(value, 2, MidpointRounding.AwayFromZero);
        }
    }
}
