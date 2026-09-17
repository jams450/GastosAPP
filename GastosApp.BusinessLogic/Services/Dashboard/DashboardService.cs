using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Dashboard;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace GastosApp.BusinessLogic.Services
{
    public class DashboardService : IDashboardService
    {
        private const int CategoryTopLimit = 8;
        private const int SubcategoryTopLimit = 12;
        private const int AccountTopLimit = 8;
        private const int HistoricalMonths = 6;
        private const int DefaultProjectionMonths = 6;
        private const int MinProjectionMonths = 1;
        private const int MaxProjectionMonths = 24;
        private const int MinTrendSampleMonths = 3;

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
                    MonthExpense = financialSummary.CashExpense,
                    MonthNet = cashAccounts.Sum(a => a.MonthNet),
                    MonthFinancialNet = financialSummary.CashFinancialNet
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

            var trend = CalculateProjectionTrend(historicalMonths);
            var msiInstallments = await QueryOpenMsiInstallmentsAsync(userId);

            var monthsProjection = new List<DashboardProjectionMonth>(horizonMonths);
            var runningBalance = cashRealBalance;
            var cumulativeMsiCommitment = 0m;
            for (var offset = 1; offset <= horizonMonths; offset++)
            {
                var bucket = new DateTime(currentYear, currentMonth, 1).AddMonths(offset);
                var monthKey = FormatMonthKey(bucket.Year, bucket.Month);

                if (trend.HasSufficientHistory)
                {
                    runningBalance += trend.ProjectedMonthlyNet;
                }

                var msiCommitment = RoundMoney(msiInstallments
                    .Where(i => ResolveMonthKey(i.DueDate, timezone) == monthKey)
                    .Sum(i => i.RemainingAmount));
                cumulativeMsiCommitment += msiCommitment;

                monthsProjection.Add(new DashboardProjectionMonth
                {
                    Month = monthKey,
                    ProjectedCashBalance = RoundMoney(runningBalance),
                    ProjectedNet = trend.HasSufficientHistory ? trend.ProjectedMonthlyNet : 0m,
                    MsiCommitment = msiCommitment,
                    MsiPaymentScenarioBalance = RoundMoney(runningBalance - cumulativeMsiCommitment)
                });
            }

            return new DashboardProjectionResponse
            {
                AsOfDate = asOfDate,
                Timezone = timezoneId,
                HorizonMonths = horizonMonths,
                CashRealBalance = RoundMoney(cashRealBalance),
                HistoricalMonths = historicalMonths,
                Trend = trend,
                Months = monthsProjection,
                MsiPlans = BuildMsiPlans(msiInstallments)
            };
        }

        private static DashboardProjectionTrend CalculateProjectionTrend(IReadOnlyList<DashboardHistoricalMonth> historicalMonths)
        {
            var sampleMonths = historicalMonths.Count(m => m.Income != 0 || m.Expense != 0);
            if (sampleMonths < MinTrendSampleMonths)
            {
                return new DashboardProjectionTrend
                {
                    SampleMonths = sampleMonths,
                    MonthlyNetSlope = 0m,
                    ProjectedMonthlyNet = 0m,
                    HasSufficientHistory = false
                };
            }

            // Regresión lineal ordinaria de net mensual sobre el índice temporal de los seis buckets.
            var count = historicalMonths.Count;
            decimal sumX = 0m, sumY = 0m, sumXY = 0m, sumXX = 0m;
            for (var index = 0; index < count; index++)
            {
                decimal x = index;
                var y = historicalMonths[index].Net;
                sumX += x;
                sumY += y;
                sumXY += x * y;
                sumXX += x * x;
            }

            var denominator = count * sumXX - sumX * sumX;
            var slope = denominator == 0m ? 0m : (count * sumXY - sumX * sumY) / denominator;
            var intercept = (sumY - slope * sumX) / count;
            var projectedMonthlyNet = intercept + slope * count;

            return new DashboardProjectionTrend
            {
                SampleMonths = sampleMonths,
                MonthlyNetSlope = RoundMoney(slope),
                ProjectedMonthlyNet = RoundMoney(projectedMonthlyNet),
                HasSufficientHistory = true
            };
        }

        private async Task<List<MsiOpenInstallmentRow>> QueryOpenMsiInstallmentsAsync(int userId)
        {
            // Filtro de "no pagada" en SQL, mismo criterio que TransactionQueryService.GetOpenCreditInstallmentsAsync.
            // El CHECK de credit_installments.status fija los valores exactos, por lo que != Paid cubre el
            // OrdinalIgnoreCase que antes se aplicaba en memoria.
            // El consumidor (BuildMsiPlans) sólo lee escalares: proyección en vez de materializar
            // Installment/Plan/Account/SourceCharge/SourceTransaction completos.
            var rows = await _repository.Get<CreditInstallment>(i =>
                    i.Plan.Account.UserId == userId &&
                    i.Plan.Account.Active &&
                    i.Plan.PlanType == TransactionDomainConstants.CreditPlanType.Msi &&
                    i.Status != TransactionDomainConstants.CreditStatus.Paid)
                .AsNoTracking()
                .Select(i => new
                {
                    i.InstallmentId,
                    i.PlanId,
                    i.Plan.AccountId,
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
                    return new MsiOpenInstallmentRow
                    {
                        InstallmentId = row.InstallmentId,
                        PlanId = row.PlanId,
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

        private static List<DashboardMsiPlan> BuildMsiPlans(IReadOnlyList<MsiOpenInstallmentRow> installments)
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
            if (!accountCreditTypes.TryGetValue(first.AccountId, out var firstIsCredit) ||
                !accountCreditTypes.TryGetValue(second.AccountId, out var secondIsCredit) ||
                firstIsCredit == secondIsCredit)
            {
                return;
            }

            MonthTransactionRow source;
            MonthTransactionRow destination;
            if (first.BalanceImpact < 0)
            {
                source = first;
                destination = second;
            }
            else if (second.BalanceImpact < 0)
            {
                source = second;
                destination = first;
            }
            else if (first.BalanceImpact > 0)
            {
                source = second;
                destination = first;
            }
            else if (second.BalanceImpact > 0)
            {
                source = first;
                destination = second;
            }
            else
            {
                source = first.TransactionId < second.TransactionId ? first : second;
                destination = source == first ? second : first;
            }

            AddTransferFinancialImpact(summary, source.AccountId, destination.AccountId, source.Amount, accountCreditTypes);
        }

        private static void AddTransferFinancialImpact(
            DashboardFinancialSummary summary,
            MonthTransactionRow transaction,
            IReadOnlyDictionary<int, bool> accountCreditTypes)
        {
            if (!transaction.CounterpartyAccountId.HasValue)
            {
                return;
            }

            int sourceAccountId;
            int destinationAccountId;
            if (transaction.BalanceImpact < 0 ||
                (transaction.BalanceImpact == 0 && string.Equals(transaction.Direction, "debit", StringComparison.OrdinalIgnoreCase)))
            {
                sourceAccountId = transaction.AccountId;
                destinationAccountId = transaction.CounterpartyAccountId.Value;
            }
            else if (transaction.BalanceImpact > 0 ||
                     (transaction.BalanceImpact == 0 && string.Equals(transaction.Direction, "credit", StringComparison.OrdinalIgnoreCase)))
            {
                sourceAccountId = transaction.CounterpartyAccountId.Value;
                destinationAccountId = transaction.AccountId;
            }
            else
            {
                // Legacy zero-impact rows without Direction require the paired TransferGroupId row above.
                return;
            }

            AddTransferFinancialImpact(summary, sourceAccountId, destinationAccountId, transaction.Amount, accountCreditTypes);
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
        private sealed class MonthTransactionRow
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

        private sealed class MsiOpenInstallmentRow
        {
            public int InstallmentId { get; set; }
            public int PlanId { get; set; }
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
