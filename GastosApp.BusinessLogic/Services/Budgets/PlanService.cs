using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// Vista consolidada del plan de un periodo. Reutiliza el estado de presupuestos de
    /// <see cref="IBudgetService"/> en vez de recalcular el gasto, y agrega las partes que ese
    /// servicio no cubre: ingresos planificados, desviaciones por partida y partidas sin presupuesto.
    /// </summary>
    public class PlanService : IPlanService
    {
        private readonly IRepository _repository;
        private readonly IBudgetService _budgetService;

        public PlanService(IRepository repository, IBudgetService budgetService)
        {
            _repository = repository;
            _budgetService = budgetService;
        }

        public async Task<PlanSummaryResult> GetSummaryAsync(int userId, string? periodKey)
        {
            var (year, month, _, _) = MonthRangeResolver.ResolveUtcRange(periodKey, null);
            var effectivePeriod = $"{year:D4}-{month:D2}";

            // Desglose por presupuesto: no se duplica la lógica de gasto/comprometido del servicio.
            var budgets = await _budgetService.GetPeriodStatusAsync(userId, effectivePeriod);

            var items = await _repository.Get<BudgetItem>(i =>
                    i.UserId == userId &&
                    i.PeriodKey == effectivePeriod)
                .ToListAsync();

            var periodOpen = MonthRangeResolver.IsPeriodOpen(effectivePeriod);

            var result = new PlanSummaryResult
            {
                PeriodKey = effectivePeriod,
                Budgets = budgets
            };

            // Ingresos planificados: bloque propio, nunca mezclado con límites de gasto.
            var incomeItems = items
                .Where(i => i.Kind == TransactionDomainConstants.TransactionType.Income &&
                            i.Status != BudgetItemStatus.Cancelled)
                .ToList();

            result.PlannedIncome = RoundMoney(incomeItems.Sum(i => i.PlannedAmount));
            result.CommittedIncome = periodOpen
                ? RoundMoney(incomeItems.Where(i => !i.IsProjected).Sum(i => i.PlannedAmount))
                : 0m;
            result.ProjectedIncome = periodOpen
                ? RoundMoney(incomeItems.Where(i => i.IsProjected).Sum(i => i.PlannedAmount))
                : 0m;

            // Ingresos ya ejecutados del periodo: foto real, no plan.
            result.ExecutedIncome = await GetExecutedIncomeAsync(userId, effectivePeriod);

            // Desviaciones: solo partidas ya ejecutadas tienen un monto real contra el que comparar.
            result.Variances = await GetVariancesAsync(userId, items);

            // Partidas del periodo que no caen en ningún presupuesto por scope.
            result.ItemsWithoutBudget = await GetItemsWithoutBudgetAsync(userId, items, budgets);

            // Flujo planificado por cuenta: agrupa las partidas que tienen account_id. No es un
            // cálculo de saldo proyectado, solo la suma de lo planificado por cuenta.
            result.AccountFlows = items
                .Where(i => i.AccountId.HasValue && i.Status != BudgetItemStatus.Cancelled)
                .GroupBy(i => i.AccountId!.Value)
                .Select(g => new PlanAccountFlow
                {
                    AccountId = g.Key,
                    PlannedExpense = RoundMoney(g.Where(i => i.Kind == TransactionDomainConstants.TransactionType.Expense)
                        .Sum(i => i.PlannedAmount)),
                    PlannedIncome = RoundMoney(g.Where(i => i.Kind == TransactionDomainConstants.TransactionType.Income)
                        .Sum(i => i.PlannedAmount)),
                    ItemCount = g.Count()
                })
                .OrderBy(f => f.AccountId)
                .ToList();

            return result;
        }

        /// <summary>
        /// Desviación por partida ejecutada: <c>planned_amount − amount</c> de la transacción enlazada.
        /// Una sola consulta para todas las transacciones enlazadas del periodo.
        /// </summary>
        private async Task<IReadOnlyList<PlanItemVariance>> GetVariancesAsync(int userId, IReadOnlyList<BudgetItem> items)
        {
            var linked = items
                .Where(i => i.TransactionId.HasValue && i.Status == BudgetItemStatus.Executed)
                .ToList();

            if (linked.Count == 0)
            {
                return Array.Empty<PlanItemVariance>();
            }

            var transactionIds = linked.Select(i => i.TransactionId!.Value).Distinct().ToList();
            var amounts = await _repository.Get<Transaction>(t =>
                    t.Account.UserId == userId && transactionIds.Contains(t.TransactionId))
                .Select(t => new { t.TransactionId, t.Amount })
                .ToDictionaryAsync(t => t.TransactionId, t => t.Amount);

            return linked
                .Select(i =>
                {
                    var executed = amounts.TryGetValue(i.TransactionId!.Value, out var amount) ? amount : 0m;
                    return new PlanItemVariance
                    {
                        ItemId = i.ItemId,
                        Name = i.Name,
                        Kind = i.Kind,
                        PlannedAmount = RoundMoney(i.PlannedAmount),
                        ExecutedAmount = RoundMoney(executed),
                        Variance = RoundMoney(i.PlannedAmount - executed)
                    };
                })
                .OrderByDescending(v => Math.Abs(v.Variance))
                .ToList();
        }

        /// <summary>
        /// Partidas que no caen en ningún presupuesto del periodo. Se excluyen las canceladas: ya
        /// liberaron su monto y no forman parte del plan vigente. Un presupuesto por categoría cubre
        /// sus subcategorías, igual que <c>BudgetService.ResolveSpent</c>, por lo que se resuelve el
        /// <c>category_id</c> padre de las subcategorías referenciadas antes de decidir cobertura.
        /// Solo se consideran partidas de gasto: un presupuesto admite exclusivamente scope de
        /// categoría o subcategoría de tipo <c>expense</c>, así que una partida de ingreso nunca
        /// puede quedar cubierta y aparecería siempre aquí como ruido permanente. El rollup de
        /// ingresos vive en su propio bloque (<c>plannedIncome</c>/<c>committedIncome</c>/
        /// <c>projectedIncome</c>), no en el de presupuestos.
        /// </summary>
        private async Task<IReadOnlyList<BudgetItemListItem>> GetItemsWithoutBudgetAsync(
            int userId,
            IReadOnlyList<BudgetItem> items,
            IReadOnlyList<BudgetStatusResult> budgets)
        {
            var candidates = items
                .Where(i => i.Status != BudgetItemStatus.Cancelled &&
                            i.Kind == TransactionDomainConstants.TransactionType.Expense)
                .ToList();

            if (budgets.Count == 0)
            {
                return candidates.Select(MapItem).ToList();
            }

            var budgetCategoryIds = budgets
                .Where(b => b.CategoryId.HasValue)
                .Select(b => b.CategoryId!.Value)
                .ToHashSet();
            var budgetSubcategoryIds = budgets
                .Where(b => b.SubcategoryId.HasValue)
                .Select(b => b.SubcategoryId!.Value)
                .ToHashSet();

            var subcategoryIds = candidates
                .Where(i => i.SubcategoryId.HasValue)
                .Select(i => i.SubcategoryId!.Value)
                .Distinct()
                .ToList();

            var parentBySubcategory = subcategoryIds.Count == 0
                ? new Dictionary<int, int>()
                : await _repository.Get<Subcategory>(s => subcategoryIds.Contains(s.SubcategoryId))
                    .Select(s => new { s.SubcategoryId, s.CategoryId })
                    .ToDictionaryAsync(s => s.SubcategoryId, s => s.CategoryId);

            var result = new List<BudgetItemListItem>();

            foreach (var item in candidates)
            {
                var covered = false;

                if (item.SubcategoryId.HasValue)
                {
                    // La partida cae en su presupuesto por subcategoría o en el de la categoría padre.
                    covered = budgetSubcategoryIds.Contains(item.SubcategoryId.Value) ||
                              (parentBySubcategory.TryGetValue(item.SubcategoryId.Value, out var parent) &&
                               budgetCategoryIds.Contains(parent));
                }
                else if (item.CategoryId.HasValue)
                {
                    covered = budgetCategoryIds.Contains(item.CategoryId.Value);
                }

                if (!covered)
                {
                    result.Add(MapItem(item));
                }
            }

            return result;
        }

        private static BudgetItemListItem MapItem(BudgetItem i) => new()
        {
            ItemId = i.ItemId,
            PeriodKey = i.PeriodKey,
            Kind = i.Kind,
            Name = i.Name,
            PlannedAmount = i.PlannedAmount,
            PlannedDate = i.PlannedDate,
            CategoryId = i.CategoryId,
            SubcategoryId = i.SubcategoryId,
            AccountId = i.AccountId,
            MerchantId = i.MerchantId,
            RecurringItemId = i.RecurringItemId,
            Status = i.Status,
            IsProjected = i.IsProjected,
            TransactionId = i.TransactionId,
            Source = i.Source,
            Notes = i.Notes,
            Created = i.Created,
            Updated = i.Updated
        };

        private async Task<decimal> GetExecutedIncomeAsync(int userId, string periodKey)
        {
            var (_, _, startUtc, nextStartUtc) = MonthRangeResolver.ResolveUtcRange(periodKey, null);

            var total = await _repository.Get<Transaction>(t =>
                    t.Account.UserId == userId &&
                    t.Type == TransactionDomainConstants.TransactionType.Income &&
                    t.TransferGroupId == null &&
                    t.TransactionDate >= startUtc &&
                    t.TransactionDate < nextStartUtc)
                .SumAsync(t => (decimal?)t.Amount);

            return RoundMoney(total ?? 0m);
        }

        private static decimal RoundMoney(decimal value) =>
            Math.Round(value, 2, MidpointRounding.AwayFromZero);
    }
}
