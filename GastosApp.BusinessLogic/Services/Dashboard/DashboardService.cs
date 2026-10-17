using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Dashboard;
using GastosApp.BusinessLogic.Models.Investments;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.BusinessLogic.Services.Dashboard;
using GastosApp.BusinessLogic.Services.Investments;
using GastosApp.Models.Entities;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Text.Json;

namespace GastosApp.BusinessLogic.Services
{
    public class DashboardService : IDashboardService
    {
        private const int CategoryTopLimit = 8;
        private const int SubcategoryTopLimit = 12;
        private const int AccountTopLimit = 8;
        private const int HistoricalMonths = 6;

        /// <summary>Ventana de desviación: los últimos 3 meses calendario completos antes del mes en curso.</summary>
        private const int DeviationWindowMonths = 3;
        private const int DefaultProjectionMonths = 6;
        private const int MinProjectionMonths = 1;
        private const int MaxProjectionMonths = 24;

        /// <summary>Límite defensivo: la descripción del cargo fuente es TEXT en BD y puede ser arbitrariamente larga.</summary>
        private const int MaxMsiSourceDescriptionLength = 200;
        private readonly IRepository _repository;

        public DashboardService(IRepository repository)
        {
            _repository = repository;
        }

        public async Task<DashboardOverviewResponse> GetOverviewAsync(int userId, string? month, string timezoneId = MonthRangeResolver.DefaultTimezoneId)
        {
            var (year, monthNumber, monthStart, nextMonthStart) = MonthRangeResolver.ResolveUtcRange(month, timezoneId);
            var previousMonthDate = new DateTime(year, monthNumber, 1).AddMonths(-1);
            var daysInMonth = DateTime.DaysInMonth(year, monthNumber);
            var previousDaysInMonth = DateTime.DaysInMonth(previousMonthDate.Year, previousMonthDate.Month);

            var accountRows = await QueryAccountOverviewRowsAsync(
                userId,
                monthStart,
                nextMonthStart,
                year,
                monthNumber,
                daysInMonth,
                previousMonthDate.Year,
                previousMonthDate.Month,
                previousDaysInMonth);

            var accounts = accountRows.Adapt<List<DashboardAccountOverview>>();
            var monthTransactions = await QueryMonthTransactionsAsync(userId, monthStart, nextMonthStart);
            var accountCreditTypes = await QueryUserAccountCreditTypesAsync(userId);
            var monthCreditCharges = await QueryMonthCreditChargesAsync(userId, monthStart, nextMonthStart);
            var financialSummary = CalculateFinancialSummary(monthTransactions, accountCreditTypes);
            var cashFlowBreakdown = DashboardCashFlowClassifier.Classify(monthTransactions, accountCreditTypes);

            var creditAccounts = accounts.Where(a => a.IsCredit).ToList();
            var cashAccounts = accounts.Where(a => !a.IsCredit).ToList();

            // Snapshot de crédito actual (no del mes): deuda = normal + MSI, disponible = límite - deuda.
            // Se calcula por cuenta una sola vez (CurrentDebt/CreditAvailable) y el total es la suma.
            var totalNormalDebt = creditAccounts.Sum(a => a.NormalOutstanding);
            var totalMsiDebt = creditAccounts.Sum(a => a.MsiOutstanding);
            var totalDebt = creditAccounts.Sum(a => a.CurrentDebt);
            var totalLimit = creditAccounts.Sum(a => a.CreditLimit ?? 0m);
            var totalAvailable = creditAccounts.Sum(a => a.CreditAvailable ?? 0m);

            return new DashboardOverviewResponse
            {
                Month = $"{year:D4}-{monthNumber:D2}",
                Timezone = timezoneId,
                GeneralSummary = new DashboardGeneralSummary
                {
                    MonthIncome = financialSummary.CashIncome + financialSummary.CreditIncome,
                    MonthExpense = financialSummary.CashExpense + financialSummary.CreditExpense,
                    MonthFinancialNet = financialSummary.CashFinancialNet + financialSummary.CreditFinancialNet
                },
                Charts = new DashboardCharts
                {
                    ExpenseByCategory = BuildBreakdown(
                        monthTransactions
                            .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Expense))
                            .GroupBy(t => new { t.CategoryId, CategoryName = !string.IsNullOrWhiteSpace(t.CategoryName) ? t.CategoryName : "Sin categoría" })
                            .Select(g => new DashboardBreakdownItem
                            {
                                Id = g.Key.CategoryId,
                                Name = g.Key.CategoryName,
                                Amount = g.Sum(t => t.Amount),
                                CashAmount = g.Where(t => !t.AccountIsCredit).Sum(t => t.Amount),
                                CreditAmount = g.Where(t => t.AccountIsCredit).Sum(t => t.Amount)
                            }),
                        CategoryTopLimit),
                    ExpenseBySubcategory = BuildBreakdown(
                        monthTransactions
                            .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Expense))
                            .GroupBy(t => new { t.SubcategoryId, SubcategoryName = !string.IsNullOrWhiteSpace(t.SubcategoryName) ? t.SubcategoryName : "Sin subcategoría" })
                            .Select(g => new DashboardBreakdownItem
                            {
                                Id = g.Key.SubcategoryId,
                                Name = g.Key.SubcategoryName,
                                Amount = g.Sum(t => t.Amount),
                                CashAmount = g.Where(t => !t.AccountIsCredit).Sum(t => t.Amount),
                                CreditAmount = g.Where(t => t.AccountIsCredit).Sum(t => t.Amount)
                            }),
                        SubcategoryTopLimit),
                    IncomeByAccount = BuildAccountBreakdown(financialSummary.IncomeByAccount, accounts),
                    ExpenseByAccount = BuildAccountBreakdown(financialSummary.ExpenseByAccount, accounts),
                    // Sin uso en la UI del dashboard (se conserva por compatibilidad).
                    TransferInByAccount = BuildBreakdown(
                        monthTransactions
                            .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) && t.BalanceImpact > 0)
                            .GroupBy(t => new { t.AccountId, Name = t.AccountName })
                            .Select(g => new DashboardBreakdownItem
                            {
                                Id = g.Key.AccountId,
                                Name = g.Key.Name,
                                Amount = g.Sum(t => t.BalanceImpact)
                            }),
                        AccountTopLimit),
                    // Sin uso en la UI del dashboard (se conserva por compatibilidad).
                    TransferOutByAccount = BuildBreakdown(
                        monthTransactions
                            .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) && t.BalanceImpact < 0)
                            .GroupBy(t => new { t.AccountId, Name = t.AccountName })
                            .Select(g => new DashboardBreakdownItem
                            {
                                Id = g.Key.AccountId,
                                Name = g.Key.Name,
                                Amount = g.Sum(t => Math.Abs(t.BalanceImpact))
                            }),
                        AccountTopLimit)
                },
                CreditSummary = new DashboardCreditSectionSummary
                {
                    TotalAvailable = totalAvailable,
                    TotalLimit = totalLimit,
                    TotalDebt = totalDebt,
                    TotalNormalDebt = totalNormalDebt,
                    TotalMsiDebt = totalMsiDebt,
                    MonthIncome = financialSummary.CreditIncome,
                    MonthExpense = financialSummary.CreditExpense,
                    MonthNet = creditAccounts.Sum(a => a.MonthNet),
                    MonthFinancialNet = financialSummary.CreditFinancialNet,
                    TransferIn = monthTransactions
                        .Where(t => t.AccountIsCredit && IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) && t.BalanceImpact > 0)
                        .Sum(t => t.BalanceImpact),
                    TransferOut = monthTransactions
                        .Where(t => t.AccountIsCredit && IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) && t.BalanceImpact < 0)
                        .Sum(t => Math.Abs(t.BalanceImpact)),
                    MonthMsiExpense = monthCreditCharges
                        .Where(c => string.Equals(c.PlanType, TransactionDomainConstants.CreditPlanType.Msi, StringComparison.OrdinalIgnoreCase))
                        .Sum(c => c.Amount),
                    MonthNormalExpense = monthCreditCharges
                        .Where(c => !string.Equals(c.PlanType, TransactionDomainConstants.CreditPlanType.Msi, StringComparison.OrdinalIgnoreCase))
                        .Sum(c => c.Amount),
                    PendingMsi = totalMsiDebt,
                    PendingNormal = totalNormalDebt
                },
                CashSummary = new DashboardCashSectionSummary
                {
                    Total = cashAccounts.Sum(a => a.ClosingBalance),
                    MonthIncome = financialSummary.CashIncome,
                    // Heredado: gasto directo + pago a tarjeta. No cambia para consumidores/proyecciones.
                    MonthExpense = financialSummary.CashExpense,
                    MonthNet = cashAccounts.Sum(a => a.MonthNet),
                    MonthFinancialNet = financialSummary.CashFinancialNet,
                    // Desglose aditivo: separa consumo directo, pago a tarjeta y traspaso interno.
                    MonthDirectExpense = cashFlowBreakdown.DirectExpense,
                    MonthCardPayment = cashFlowBreakdown.CardPayment,
                    MonthInternalCashTransfer = cashFlowBreakdown.InternalCashTransfer,
                    MonthCashOutflow = cashFlowBreakdown.CashOutflow
                },
                Accounts = accounts
            };
        }

        public async Task<DashboardProjectionResponse> GetProjectionAsync(int userId, int? months, string timezoneId = MonthRangeResolver.DefaultTimezoneId)
        {
            var timezone = MonthRangeResolver.ResolveTimeZone(timezoneId);
            var horizonMonths = Math.Clamp(months ?? DefaultProjectionMonths, MinProjectionMonths, MaxProjectionMonths);
            var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone);
            var asOfDate = DateOnly.FromDateTime(localNow);

            var (currentYear, currentMonth, _, _) = MonthRangeResolver.ResolveUtcRange(null, timezoneId);

            // Últimos HistoricalMonths meses calendario completos anteriores al mes en curso.
            var historyBuckets = new List<(int Year, int Month)>(HistoricalMonths);
            for (var offset = HistoricalMonths; offset >= 1; offset--)
            {
                var bucket = new DateTime(currentYear, currentMonth, 1).AddMonths(-offset);
                historyBuckets.Add((bucket.Year, bucket.Month));
            }

            var historyStartUtc = TimeZoneInfo.ConvertTimeToUtc(
                new DateTime(historyBuckets[0].Year, historyBuckets[0].Month, 1, 0, 0, 0, DateTimeKind.Unspecified), timezone);
            var historyEndUtc = TimeZoneInfo.ConvertTimeToUtc(
                new DateTime(currentYear, currentMonth, 1, 0, 0, 0, DateTimeKind.Unspecified), timezone);

            var cashRealBalance = await _repository.Get<Account>(a => a.UserId == userId && !a.IsCredit && a.Active)
                .SumAsync(a => a.CurrentBalance);

            var transactions = await _repository.Get<Transaction>(t =>
                    t.Account.UserId == userId &&
                    t.Account.Active &&
                    t.TransactionDate >= historyStartUtc &&
                    t.TransactionDate < historyEndUtc)
                .AsNoTracking()
                .Select(t => new MonthTransactionRow
                {
                    TransactionId = t.TransactionId,
                    AccountId = t.AccountId,
                    TransactionDate = t.TransactionDate,
                    Type = t.Type,
                    Amount = t.Amount,
                    BalanceImpact = t.BalanceImpact,
                    Direction = t.Direction,
                    CounterpartyAccountId = t.CounterpartyAccountId,
                    TransferGroupId = t.TransferGroupId
                })
                .ToListAsync();

            var accountCreditTypes = await QueryUserAccountCreditTypesAsync(userId);

            var transactionsByMonth = transactions
                .GroupBy(t => ResolveMonthKey(t.TransactionDate, timezone))
                .ToDictionary(g => g.Key, g => g.ToList());

            var historicalMonths = new List<DashboardHistoricalMonth>(HistoricalMonths);
            foreach (var bucket in historyBuckets)
            {
                var monthKey = FormatMonthKey(bucket.Year, bucket.Month);
                var summary = new DashboardFinancialSummary();
                var hasActivity = false;
                if (transactionsByMonth.TryGetValue(monthKey, out var bucketTransactions) && bucketTransactions.Count > 0)
                {
                    hasActivity = true;
                    summary = CalculateFinancialSummary(bucketTransactions, accountCreditTypes);
                }

                // Sólo flujo de efectivo: income/expense en cuentas no crédito y el lado cash→credit
                // de las transferencias (mismas reglas que CalculateFinancialSummary del overview).
                var income = RoundMoney(summary.CashIncome);
                var expense = RoundMoney(summary.CashExpense);
                historicalMonths.Add(new DashboardHistoricalMonth
                {
                    Month = monthKey,
                    Income = income,
                    Expense = expense,
                    Net = RoundMoney(income - expense),
                    // Ausencia explícita: un bucket vacío no es "neto 0 registrado".
                    HasActivity = hasActivity
                });
            }

            // Cuotas abiertas de crédito (MSI y Revolving): única consulta, el tipo decide el uso.
            var openInstallments = await QueryOpenInstallmentsAsync(userId);
            var msiInstallments = openInstallments
                .Where(i => string.Equals(i.PlanType, TransactionDomainConstants.CreditPlanType.Msi, StringComparison.OrdinalIgnoreCase))
                .ToList();
            var normalCreditInstallments = openInstallments
                .Where(i => string.Equals(i.PlanType, TransactionDomainConstants.CreditPlanType.Revolving, StringComparison.OrdinalIgnoreCase))
                .ToList();

            // Línea base histórica de efectivo SIN traspasos de liquidación de crédito (sólo
            // income/expense en cuentas no crédito). El neto histórico legacy incluye el lado
            // cash→credit de las transferencias; esta serie limpia es la única sobre la que se
            // pueden restar MSI y crédito normal sin doble descuento.
            var cleanHistoricalMonths = new List<DashboardHistoricalMonth>(HistoricalMonths);
            foreach (var bucket in historyBuckets)
            {
                var monthKey = FormatMonthKey(bucket.Year, bucket.Month);
                var cleanIncome = 0m;
                var cleanExpense = 0m;
                if (transactionsByMonth.TryGetValue(monthKey, out var bucketTransactions))
                {
                    foreach (var transaction in bucketTransactions)
                    {
                        if (!accountCreditTypes.TryGetValue(transaction.AccountId, out var isCredit) || isCredit)
                        {
                            continue;
                        }

                        if (IsTransactionType(transaction.Type, TransactionDomainConstants.TransactionType.Income))
                        {
                            cleanIncome += transaction.Amount;
                        }
                        else if (IsTransactionType(transaction.Type, TransactionDomainConstants.TransactionType.Expense))
                        {
                            cleanExpense += transaction.Amount;
                        }
                    }
                }

                cleanHistoricalMonths.Add(new DashboardHistoricalMonth
                {
                    Month = monthKey,
                    Income = RoundMoney(cleanIncome),
                    Expense = RoundMoney(cleanExpense),
                    Net = RoundMoney(cleanIncome - cleanExpense),
                    HasActivity = cleanIncome != 0m || cleanExpense != 0m
                });
            }

            // Claves de los meses futuros del horizonte; presupuesto e inversión se consultan en
            // bloque por estas claves para no caer en N+1.
            var projectionMonthKeys = new List<string>(horizonMonths);
            for (var offset = 1; offset <= horizonMonths; offset++)
            {
                var bucket = new DateTime(currentYear, currentMonth, 1).AddMonths(offset);
                projectionMonthKeys.Add(FormatMonthKey(bucket.Year, bucket.Month));
            }

            // Desviación: sólo los últimos 3 meses completos. Los meses sin plan quedan fuera del
            // promedio aunque tengan movimientos de efectivo.
            var deviationBuckets = historyBuckets.Skip(HistoricalMonths - DeviationWindowMonths).ToList();
            var deviationMonths = await QueryDeviationMonthsAsync(userId, deviationBuckets, transactionsByMonth, accountCreditTypes);
            var deviation = DashboardProjectionCalculator.CalculateDeviation(deviationMonths, DeviationWindowMonths);

            var budgetByMonth = await QueryPendingBudgetByMonthAsync(userId, projectionMonthKeys);
            var investmentByMonth = await QueryInvestmentEstimatesByMonthAsync(userId, projectionMonthKeys);
            var msiCommitmentByMonth = msiInstallments
                .GroupBy(i => ResolveMonthKey(i.DueDate, timezone))
                .ToDictionary(g => g.Key, g => g.Sum(i => i.RemainingAmount));
            var normalCreditByMonth = normalCreditInstallments
                .GroupBy(i => ResolveMonthKey(i.DueDate, timezone))
                .ToDictionary(g => g.Key, g => g.Sum(i => i.RemainingAmount));

            var projection = DashboardProjectionCalculator.Calculate(
                historicalMonths,
                budgetByMonth,
                msiCommitmentByMonth,
                investmentByMonth,
                horizonMonths,
                currentYear,
                currentMonth,
                cashRealBalance,
                normalCreditByMonth,
                cleanHistoricalMonths,
                deviation);

            return new DashboardProjectionResponse
            {
                AsOfDate = asOfDate,
                Timezone = timezoneId,
                HorizonMonths = horizonMonths,
                CashRealBalance = RoundMoney(cashRealBalance),
                HistoricalMonths = historicalMonths,
                Trend = projection.Trend,
                Months = projection.Months,
                MsiPlans = BuildMsiPlans(msiInstallments),
                Deviation = deviation
            };
        }

        /// <summary>
        /// Resuelve la ventana de desviación para el cálculo puro. Sólo entran meses con plan no
        /// cancelado ni ignorado; el vínculo partida↔transacción decide el real contra el plan y
        /// excluye las compras financiadas con crédito (no son efectivo ni plan de efectivo
        /// incumplido). Una partida <b>pendiente</b> asignada a una cuenta de crédito o con cuenta no
        /// resoluble tampoco entra: no es plan de efectivo. Los movimientos de efectivo enlazados a
        /// cualquier partida no se cuentan como no planeados, para no duplicarlos. Los traspasos
        /// (liquidación de crédito) no son income/expense y por eso nunca entran.
        /// </summary>
        private async Task<List<DashboardDeviationMonth>> QueryDeviationMonthsAsync(
            int userId,
            IReadOnlyList<(int Year, int Month)> windowBuckets,
            IReadOnlyDictionary<string, List<MonthTransactionRow>> transactionsByMonth,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            var windowKeys = windowBuckets.Select(b => FormatMonthKey(b.Year, b.Month)).ToList();

            var items = await _repository.Get<BudgetItem>(b =>
                    b.UserId == userId &&
                    windowKeys.Contains(b.PeriodKey) &&
                    b.Status != BudgetItemStatus.Cancelled &&
                    b.Status != BudgetItemStatus.Ignored)
                .AsNoTracking()
                .Select(b => new
                {
                    b.ItemId,
                    b.PeriodKey,
                    b.Kind,
                    b.Status,
                    b.PlannedAmount,
                    b.TransactionId,
                    b.AccountId,
                    // Sólo se resuelve la cuenta si es del propio usuario: un id ajeno o inexistente
                    // queda como no resoluble y no se asume efectivo.
                    AssignedIsCredit = b.Account != null && b.Account.UserId == userId ? (bool?)b.Account.IsCredit : null
                })
                .ToListAsync();

            var linkedTransactionIds = items
                .Where(i => i.TransactionId.HasValue)
                .Select(i => i.TransactionId!.Value)
                .Distinct()
                .ToList();

            var linkedTransactions = linkedTransactionIds.Count == 0
                ? new Dictionary<int, (bool IsCredit, decimal Amount)>()
                : (await _repository.Get<Transaction>(t => t.Account.UserId == userId && linkedTransactionIds.Contains(t.TransactionId))
                        .AsNoTracking()
                        .Select(t => new { t.TransactionId, t.Amount, t.Account.IsCredit })
                        .ToListAsync())
                    .ToDictionary(t => t.TransactionId, t => (t.IsCredit, t.Amount));

            // Efectivo de la ventana: income/expense en cuentas no crédito. Un movimiento enlazado a
            // una partida de cualquier periodo no es "no planeado".
            var cashTransactionIds = windowKeys
                .Where(transactionsByMonth.ContainsKey)
                .SelectMany(key => transactionsByMonth[key])
                .Where(t => accountCreditTypes.TryGetValue(t.AccountId, out var isCredit) && !isCredit &&
                            (IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Income) ||
                             IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Expense)))
                .Select(t => t.TransactionId)
                .Distinct()
                .ToList();

            var linkedByAnyPlan = cashTransactionIds.Count == 0
                ? []
                : await _repository.Get<BudgetItem>(b =>
                        b.UserId == userId &&
                        b.TransactionId.HasValue &&
                        cashTransactionIds.Contains(b.TransactionId!.Value))
                    .Select(b => b.TransactionId!.Value)
                    .ToListAsync();

            var linkedSet = new HashSet<int>(linkedTransactionIds);
            linkedSet.UnionWith(linkedByAnyPlan);

            var result = new List<DashboardDeviationMonth>(windowKeys.Count);
            foreach (var bucket in windowBuckets)
            {
                var monthKey = FormatMonthKey(bucket.Year, bucket.Month);

                var deviationItems = new List<DashboardDeviationItem>();
                foreach (var item in items.Where(i => string.Equals(i.PeriodKey?.Trim(), monthKey, StringComparison.Ordinal)))
                {
                    var isIncome = IsTransactionType(item.Kind, TransactionDomainConstants.TransactionType.Income);
                    var isExecuted = string.Equals(item.Status, BudgetItemStatus.Executed, StringComparison.OrdinalIgnoreCase) &&
                                     item.TransactionId.HasValue;

                    if (!isExecuted)
                    {
                        // Pendiente: la cuenta asignada decide si es plan de efectivo. Crédito o
                        // cuenta no resoluble en el alcance del usuario no califica el mes ni cuenta
                        // como gasto/ingreso no ejecutado.
                        deviationItems.Add(new DashboardDeviationItem(
                            IsIncome: isIncome,
                            IsExecuted: false,
                            LinkedTransactionIsCredit: false,
                            PlannedAmount: item.PlannedAmount,
                            ActualAmount: 0m,
                            IsCashPlanEligible: DashboardProjectionCalculator.IsCashEligiblePendingPlan(item.AccountId, item.AssignedIsCredit)));
                        continue;
                    }

                    if (!linkedTransactions.TryGetValue(item.TransactionId!.Value, out var linked))
                    {
                        // Enlace roto (transacción no visible): no se inventa un real.
                        continue;
                    }

                    deviationItems.Add(new DashboardDeviationItem(
                        IsIncome: isIncome,
                        IsExecuted: true,
                        LinkedTransactionIsCredit: linked.IsCredit,
                        PlannedAmount: item.PlannedAmount,
                        ActualAmount: linked.Amount));
                }

                var cash = new List<DashboardDeviationCashTransaction>();
                if (transactionsByMonth.TryGetValue(monthKey, out var bucketTransactions))
                {
                    foreach (var transaction in bucketTransactions)
                    {
                        if (!accountCreditTypes.TryGetValue(transaction.AccountId, out var isCredit) || isCredit)
                        {
                            continue;
                        }

                        bool? isIncome = IsTransactionType(transaction.Type, TransactionDomainConstants.TransactionType.Income)
                            ? true
                            : IsTransactionType(transaction.Type, TransactionDomainConstants.TransactionType.Expense)
                                ? false
                                : null;
                        if (isIncome is null)
                        {
                            continue;
                        }

                        cash.Add(new DashboardDeviationCashTransaction(
                            IsIncome: isIncome.Value,
                            Amount: transaction.Amount,
                            IsLinkedToPlan: linkedSet.Contains(transaction.TransactionId)));
                    }
                }

                result.Add(new DashboardDeviationMonth(monthKey, deviationItems, cash));
            }

            return result;
        }

        /// <summary>
        /// Agrega las partidas <c>pending</c> del usuario por periodo futuro. Sólo se leen montos
        /// planificados: ejecutadas, ignoradas y canceladas quedan fuera. No se excluyen las
        /// partidas proyectadas de recurrencia, porque también forman parte del plan declarado del mes.
        /// Por convención del usuario las partidas de gasto excluyen cuotas MSI; la MSI se resta aparte.
        /// <para>Sólo las partidas de efectivo forman la base: las asignadas a una cuenta de crédito
        /// (compra financiada) y las de cuenta no resoluble se excluyen, y un mes sin ninguna partida
        /// de efectivo no entra al diccionario (no fabrica una base presupuestal cero).</para>
        /// </summary>
        private async Task<Dictionary<string, DashboardBudgetMonthBasis>> QueryPendingBudgetByMonthAsync(
            int userId,
            IReadOnlyList<string> projectionMonthKeys)
        {
            if (projectionMonthKeys.Count == 0)
            {
                return new Dictionary<string, DashboardBudgetMonthBasis>(StringComparer.Ordinal);
            }

            var periodKeys = projectionMonthKeys.ToList();
            var items = await _repository.Get<BudgetItem>(b =>
                    b.UserId == userId &&
                    b.Status == BudgetItemStatus.Pending &&
                    periodKeys.Contains(b.PeriodKey))
                .AsNoTracking()
                .Select(b => new
                {
                    b.PeriodKey,
                    b.Kind,
                    b.PlannedAmount,
                    b.AccountId,
                    // Sólo se resuelve la cuenta si es del propio usuario: un id ajeno o inexistente
                    // queda como no resoluble y no se asume efectivo.
                    AssignedIsCredit = b.Account != null && b.Account.UserId == userId ? (bool?)b.Account.IsCredit : null
                })
                .ToListAsync();

            return items
                .Where(b => DashboardProjectionCalculator.IsCashEligiblePendingPlan(b.AccountId, b.AssignedIsCredit))
                .GroupBy(b => b.PeriodKey.Trim())
                .ToDictionary(
                    g => g.Key,
                    g => new DashboardBudgetMonthBasis(
                        g.Key,
                        RoundMoney(g.Where(x => IsTransactionType(x.Kind, TransactionDomainConstants.TransactionType.Income)).Sum(x => x.PlannedAmount)),
                        RoundMoney(g.Where(x => IsTransactionType(x.Kind, TransactionDomainConstants.TransactionType.Expense)).Sum(x => x.PlannedAmount)),
                        g.Count()),
                    StringComparer.Ordinal);
        }

        /// <summary>
        /// Estima el rendimiento mensual de inversión a partir de planes <b>persistidos</b> del usuario
        /// (nunca borradores). Una sola consulta con asignaciones incluidas; la selección mes a mes
        /// vive en <see cref="DashboardProjectionCalculator.BuildInvestmentEstimates"/>.
        /// </summary>
        private async Task<Dictionary<string, DashboardInvestmentMonthEstimate>> QueryInvestmentEstimatesByMonthAsync(
            int userId,
            IReadOnlyList<string> projectionMonthKeys)
        {
            var plans = await _repository.Get<InvestmentPlan>(p => p.UserId == userId)
                .AsNoTracking()
                .Include(p => p.Allocations)
                .ToListAsync();

            var snapshots = plans
                .Select(plan => new DashboardInvestmentPlanSnapshot(
                    plan.PlanMonth?.Trim() ?? string.Empty,
                    plan.ProjectionMonths,
                    plan.Allocations
                        .Select(allocation => new DashboardInvestmentAllocationSnapshot(
                            allocation.AllocatedAmount,
                            DeserializeTierSnapshot(allocation.TierSnapshotJson)))
                        .ToList()))
                .ToList();

            var estimates = DashboardProjectionCalculator.BuildInvestmentEstimates(snapshots, projectionMonthKeys);
            return new Dictionary<string, DashboardInvestmentMonthEstimate>(estimates, StringComparer.Ordinal);
        }

        private static List<MarginalRateTier> DeserializeTierSnapshot(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return [];
            }

            try
            {
                return (JsonSerializer.Deserialize<List<InvestmentTierSnapshot>>(json) ?? [])
                    .Select(MarginalRateTier.From)
                    .ToList();
            }
            catch (JsonException)
            {
                return [];
            }
        }

        private async Task<List<OpenInstallmentRow>> QueryOpenInstallmentsAsync(int userId)
        {
            // Filtro de "no pagada" en SQL, mismo criterio que TransactionQueryService.GetOpenCreditInstallmentsAsync.
            // El CHECK de credit_installments.status fija los valores exactos, por lo que != Paid cubre el
            // OrdinalIgnoreCase que antes se aplicaba en memoria.
            // Se traen MSI y Revolving en una sola consulta; el llamador separa por PlanType. El
            // consumidor (BuildMsiPlans) sólo lee escalares: proyección en vez de materializar
            // Installment/Plan/Account/SourceCharge/SourceTransaction completos.
            var rows = await _repository.Get<CreditInstallment>(i =>
                    i.Plan.Account.UserId == userId &&
                    i.Plan.Account.Active &&
                    (i.Plan.PlanType == TransactionDomainConstants.CreditPlanType.Msi ||
                     i.Plan.PlanType == TransactionDomainConstants.CreditPlanType.Revolving) &&
                    i.Status != TransactionDomainConstants.CreditStatus.Paid)
                .AsNoTracking()
                .Select(i => new
                {
                    i.InstallmentId,
                    i.PlanId,
                    i.Plan.AccountId,
                    i.Plan.PlanType,
                    AccountName = i.Plan.Account.Name,
                    Description = i.Plan.SourceCharge != null && i.Plan.SourceCharge.SourceTransaction != null
                        ? i.Plan.SourceCharge.SourceTransaction.Description
                        : null,
                    i.DueDate,
                    i.TotalDue
                })
                .ToListAsync();

            if (rows.Count == 0)
            {
                return [];
            }

            // Mismo cálculo que TransactionQueryService.GetOpenCreditInstallmentsAsync:
            // el pendiente es TotalDue menos las allocations aplicadas, nunca TotalDue a secas.
            var installmentIds = rows.Select(i => i.InstallmentId).ToList();
            var paidRows = await _repository.Get<InstallmentAllocation>(a => installmentIds.Contains(a.InstallmentId))
                .GroupBy(a => a.InstallmentId)
                .Select(g => new { InstallmentId = g.Key, Paid = g.Sum(x => x.AllocatedAmount) })
                .ToListAsync();
            var paidByInstallment = paidRows.ToDictionary(x => x.InstallmentId, x => x.Paid);

            return rows
                .Select(row =>
                {
                    var paid = paidByInstallment.TryGetValue(row.InstallmentId, out var value) ? value : 0m;
                    return new OpenInstallmentRow
                    {
                        InstallmentId = row.InstallmentId,
                        PlanId = row.PlanId,
                        PlanType = row.PlanType,
                        AccountId = row.AccountId,
                        AccountName = row.AccountName,
                        Description = NormalizeMsiSourceDescription(row.Description),
                        DueDate = row.DueDate,
                        TotalDue = row.TotalDue,
                        RemainingAmount = Math.Max(row.TotalDue - paid, 0m)
                    };
                })
                .Where(x => x.RemainingAmount > 0)
                .ToList();
        }

        private static List<DashboardMsiPlan> BuildMsiPlans(IReadOnlyList<OpenInstallmentRow> installments)
        {
            return installments
                .GroupBy(i => i.PlanId)
                .Select(group =>
                {
                    var rows = group.ToList();
                    var scheduleComplete = rows.All(r => r.DueDate != default && r.TotalDue > 0m);
                    var next = rows.OrderBy(r => r.DueDate).ThenBy(r => r.InstallmentId).First();
                    return new DashboardMsiPlan
                    {
                        PlanId = group.Key,
                        AccountId = rows[0].AccountId,
                        AccountName = rows[0].AccountName,
                        Description = rows.Select(r => r.Description).FirstOrDefault(d => !string.IsNullOrWhiteSpace(d)) ?? string.Empty,
                        RemainingAmount = RoundMoney(rows.Sum(r => r.RemainingAmount)),
                        OpenInstallments = rows.Count,
                        NextDueDate = next.DueDate == default ? null : next.DueDate,
                        NextDueAmount = RoundMoney(next.RemainingAmount),
                        EndsOn = scheduleComplete ? rows.Max(r => r.DueDate) : null,
                        ScheduleComplete = scheduleComplete
                    };
                })
                .OrderBy(p => p.NextDueDate ?? DateTime.MaxValue)
                .ThenBy(p => p.PlanId)
                .ToList();
        }

        private static string ResolveMonthKey(DateTime utcDate, TimeZoneInfo timezone)
        {
            var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcDate, DateTimeKind.Utc), timezone);
            return FormatMonthKey(local.Year, local.Month);
        }

        private static string FormatMonthKey(int year, int month)
        {
            return $"{year:D4}-{month:D2}";
        }

        private static decimal RoundMoney(decimal value)
        {
            return Math.Round(value, 2, MidpointRounding.AwayFromZero);
        }

        private static string NormalizeMsiSourceDescription(string? description)
        {
            if (string.IsNullOrWhiteSpace(description))
            {
                return string.Empty;
            }

            var trimmed = description.Trim();
            return trimmed.Length <= MaxMsiSourceDescriptionLength
                ? trimmed
                : trimmed[..MaxMsiSourceDescriptionLength];
        }

        private async Task<List<DashboardAccountSqlRow>> QueryAccountOverviewRowsAsync(
            int userId,
            DateTime monthStart,
            DateTime nextMonthStart,
            int year,
            int monthNumber,
            int daysInMonth,
            int previousYear,
            int previousMonth,
            int previousDaysInMonth)
        {
            var sql = @"
                    SELECT *
                    FROM fn_dashboard_credit_overview(
                        @userId,
                        @monthStart,
                        @nextMonthStart,
                        @yearValue,
                        @monthValue,
                        @daysInMonth,
                        @previousYear,
                        @previousMonth,
                        @previousDaysInMonth
                    )
                    ORDER BY ""Name"";";

            return await _repository.SqlQueryAsync<DashboardAccountSqlRow>(
                sql,
                new NpgsqlParameter("userId", userId),
                new NpgsqlParameter("monthStart", monthStart),
                new NpgsqlParameter("nextMonthStart", nextMonthStart),
                new NpgsqlParameter("yearValue", year),
                new NpgsqlParameter("monthValue", monthNumber),
                new NpgsqlParameter("daysInMonth", daysInMonth),
                new NpgsqlParameter("previousYear", previousYear),
                new NpgsqlParameter("previousMonth", previousMonth),
                new NpgsqlParameter("previousDaysInMonth", previousDaysInMonth));
        }

        private async Task<List<MonthTransactionRow>> QueryMonthTransactionsAsync(int userId, DateTime monthStart, DateTime nextMonthStart)
        {
            // Proyección de sólo las columnas que consumen CalculateFinancialSummary y los breakdowns
            // (categoría/subcategoría/cuenta). Antes se cargaban las entidades completas con 3 Include.
            return await _repository.Get<Transaction>(t =>
                    t.Account.UserId == userId &&
                    t.Account.Active &&
                    t.TransactionDate >= monthStart &&
                    t.TransactionDate < nextMonthStart)
                .AsNoTracking()
                .Select(t => new MonthTransactionRow
                {
                    TransactionId = t.TransactionId,
                    AccountId = t.AccountId,
                    TransactionDate = t.TransactionDate,
                    Type = t.Type,
                    Amount = t.Amount,
                    BalanceImpact = t.BalanceImpact,
                    Direction = t.Direction,
                    CounterpartyAccountId = t.CounterpartyAccountId,
                    TransferGroupId = t.TransferGroupId,
                    CategoryId = t.CategoryId,
                    CategoryName = t.Category != null ? t.Category.Name : null,
                    SubcategoryId = t.SubcategoryId,
                    SubcategoryName = t.Subcategory != null ? t.Subcategory.Name : null,
                    AccountIsCredit = t.Account.IsCredit,
                    AccountName = t.Account.Name
                })
                .ToListAsync();
        }

        private async Task<Dictionary<int, bool>> QueryUserAccountCreditTypesAsync(int userId)
        {
            return await _repository.Get<Account>(a => a.UserId == userId && a.Active)
                .AsNoTracking()
                .ToDictionaryAsync(a => a.AccountId, a => a.IsCredit);
        }

        private static DashboardFinancialSummary CalculateFinancialSummary(
            IEnumerable<MonthTransactionRow> transactions,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            var summary = new DashboardFinancialSummary();
            var transactionList = transactions.ToList();

            foreach (var transaction in transactionList)
            {
                if (!accountCreditTypes.TryGetValue(transaction.AccountId, out var isCredit))
                {
                    continue;
                }

                if (IsTransactionType(transaction.Type, TransactionDomainConstants.TransactionType.Income))
                {
                    summary.AddIncome(transaction.AccountId, isCredit, transaction.Amount);
                }
                else if (IsTransactionType(transaction.Type, TransactionDomainConstants.TransactionType.Expense))
                {
                    summary.AddExpense(transaction.AccountId, isCredit, transaction.Amount);
                }
            }

            var pairedTransferIds = new HashSet<int>();
            foreach (var transferGroup in transactionList
                         .Where(t => IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) && t.TransferGroupId.HasValue)
                         .GroupBy(t => t.TransferGroupId)
                         .Where(g => g.Count() == 2))
            {
                var pair = transferGroup.ToList();
                pairedTransferIds.UnionWith(pair.Select(t => t.TransactionId));
                AddTransferFinancialImpact(summary, pair[0], pair[1], accountCreditTypes);
            }

            foreach (var transaction in transactionList.Where(t =>
                         IsTransactionType(t.Type, TransactionDomainConstants.TransactionType.Transfer) &&
                         !pairedTransferIds.Contains(t.TransactionId)))
            {
                AddTransferFinancialImpact(summary, transaction, accountCreditTypes);
            }

            return summary;
        }

        private static void AddTransferFinancialImpact(
            DashboardFinancialSummary summary,
            MonthTransactionRow first,
            MonthTransactionRow second,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            // Resolución compartida con el desglose de efectivo: una sola fuente de verdad.
            if (!DashboardCashFlowClassifier.TryResolveEndpoints(first, second, out var sourceAccountId, out var destinationAccountId, out var amount))
            {
                return;
            }

            AddTransferFinancialImpact(summary, sourceAccountId, destinationAccountId, amount, accountCreditTypes);
        }

        private static void AddTransferFinancialImpact(
            DashboardFinancialSummary summary,
            MonthTransactionRow transaction,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            if (!DashboardCashFlowClassifier.TryResolveEndpoints(transaction, out var sourceAccountId, out var destinationAccountId, out var amount))
            {
                return;
            }

            AddTransferFinancialImpact(summary, sourceAccountId, destinationAccountId, amount, accountCreditTypes);
        }

        private static void AddTransferFinancialImpact(
            DashboardFinancialSummary summary,
            int sourceAccountId,
            int destinationAccountId,
            decimal amount,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            if (!accountCreditTypes.TryGetValue(sourceAccountId, out var sourceIsCredit) ||
                !accountCreditTypes.TryGetValue(destinationAccountId, out var destinationIsCredit) ||
                sourceIsCredit == destinationIsCredit)
            {
                return;
            }

            if (!sourceIsCredit && destinationIsCredit)
            {
                summary.AddExpense(sourceAccountId, false, amount);
                summary.AddIncome(destinationAccountId, true, amount);
            }
            else if (sourceIsCredit)
            {
                summary.AddExpense(sourceAccountId, true, amount);
            }
        }

        private async Task<List<DashboardCreditChargeRow>> QueryMonthCreditChargesAsync(int userId, DateTime monthStart, DateTime nextMonthStart)
        {
            return await _repository.Get<CreditCharge>(c =>
                    c.Account.UserId == userId &&
                    c.Account.Active &&
                    c.OccurredAt >= monthStart &&
                    c.OccurredAt < nextMonthStart)
                .Select(c => new DashboardCreditChargeRow
                {
                    AccountId = c.AccountId,
                    Amount = c.PrincipalAmount,
                    PlanType = c.InstallmentPlan != null ? c.InstallmentPlan.PlanType : TransactionDomainConstants.CreditPlanType.Revolving
                })
                .ToListAsync();
        }

        private static List<DashboardBreakdownItem> BuildAccountBreakdown(
            IReadOnlyDictionary<int, decimal> amounts,
            IEnumerable<DashboardAccountOverview> accounts)
        {
            var accountNames = accounts.ToDictionary(a => a.AccountId, a => a.Name);
            return BuildBreakdown(
                amounts.Select(amount => new DashboardBreakdownItem
                {
                    Id = amount.Key,
                    Name = accountNames.GetValueOrDefault(amount.Key, $"Cuenta {amount.Key}"),
                    Amount = amount.Value
                }),
                AccountTopLimit);
        }

        private static List<DashboardBreakdownItem> BuildBreakdown(IEnumerable<DashboardBreakdownItem> source, int? limit = null)
        {
            var ordered = source
                .Where(x => x.Amount != 0)
                .OrderByDescending(x => Math.Abs(x.Amount))
                .ThenBy(x => x.Name)
                .ToList();

            if (!limit.HasValue || ordered.Count <= limit.Value)
            {
                return ordered;
            }

            var top = ordered.Take(limit.Value).ToList();
            var others = ordered.Skip(limit.Value).ToList();
            var othersAmount = others.Sum(x => x.Amount);

            if (othersAmount != 0)
            {
                top.Add(new DashboardBreakdownItem
                {
                    Id = null,
                    Name = "Otros",
                    Amount = othersAmount,
                    CashAmount = others.Sum(x => x.CashAmount),
                    CreditAmount = others.Sum(x => x.CreditAmount)
                });
            }

            return top;
        }

        private static bool IsTransactionType(string? actual, string expected)
        {
            return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
        }

        private sealed class DashboardCreditChargeRow
        {
            public int AccountId { get; set; }
            public decimal Amount { get; set; }
            public string PlanType { get; set; } = TransactionDomainConstants.CreditPlanType.Revolving;
        }

        /// <summary>Columnas leídas de <c>transactions</c> por el dashboard: evita materializar la entidad completa.</summary>
        private sealed class MonthTransactionRow : IDashboardCashFlowTransaction
        {
            public int TransactionId { get; set; }
            public int AccountId { get; set; }
            public DateTime TransactionDate { get; set; }
            public string Type { get; set; } = string.Empty;
            public decimal Amount { get; set; }
            public decimal BalanceImpact { get; set; }
            public string? Direction { get; set; }
            public int? CounterpartyAccountId { get; set; }
            public Guid? TransferGroupId { get; set; }
            public int? CategoryId { get; set; }
            public string? CategoryName { get; set; }
            public int? SubcategoryId { get; set; }
            public string? SubcategoryName { get; set; }
            public bool AccountIsCredit { get; set; }
            public string AccountName { get; set; } = string.Empty;
        }

        private sealed class OpenInstallmentRow
        {
            public int InstallmentId { get; set; }
            public int PlanId { get; set; }
            public string PlanType { get; set; } = TransactionDomainConstants.CreditPlanType.Revolving;
            public int AccountId { get; set; }
            public string AccountName { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public DateTime DueDate { get; set; }
            public decimal TotalDue { get; set; }
            public decimal RemainingAmount { get; set; }
        }

        private sealed class DashboardFinancialSummary
        {
            public decimal CashIncome { get; private set; }
            public decimal CashExpense { get; private set; }
            public decimal CreditIncome { get; private set; }
            public decimal CreditExpense { get; private set; }
            public Dictionary<int, decimal> IncomeByAccount { get; } = [];
            public Dictionary<int, decimal> ExpenseByAccount { get; } = [];
            public decimal CashFinancialNet => CashIncome - CashExpense;
            public decimal CreditFinancialNet => CreditIncome - CreditExpense;

            public void AddIncome(int accountId, bool isCredit, decimal amount)
            {
                IncomeByAccount[accountId] = IncomeByAccount.GetValueOrDefault(accountId) + amount;
                if (isCredit)
                {
                    CreditIncome += amount;
                    return;
                }

                CashIncome += amount;
            }

            public void AddExpense(int accountId, bool isCredit, decimal amount)
            {
                ExpenseByAccount[accountId] = ExpenseByAccount.GetValueOrDefault(accountId) + amount;
                if (isCredit)
                {
                    CreditExpense += amount;
                    return;
                }

                CashExpense += amount;
            }
        }
    }
}
