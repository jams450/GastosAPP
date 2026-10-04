namespace GastosApp.API.Services.Telegram;

public sealed record TelegramFinancialRequest(string? Mes = null, string? Scope = null);
public sealed record TelegramAlertRequest(string? Mes = null);

public sealed record TelegramAlertDelivery(
    int DeliveryId, int BudgetId, string BudgetName, int ThresholdId, string ThresholdName,
    string PeriodKey, decimal ThresholdPercent, decimal BudgetAmount, decimal SpentAmount,
    decimal PercentUsed, DateTime? CreatedAt, string? OutboxStatus, DateTimeOffset? SentAt, bool Sent);

public sealed record TelegramAlertResponse(
    string Month, string Timezone, string HistoryScope,
    int TotalDeliveries, int SentCount, int PendingCount, int FailedCount, int UnknownStatusCount,
    bool Truncated, IReadOnlyList<TelegramAlertDelivery> Deliveries);

public sealed record TelegramCashAccount(int AccountId, string Name, decimal Balance);
public sealed record TelegramCashBalances(
    string Month, string BalanceBasis, decimal TotalBalance, int TotalAccounts,
    bool Truncated, IReadOnlyList<TelegramCashAccount> Accounts);

public sealed record TelegramCreditAccount(int AccountId, string Name, decimal? Available);
public sealed record TelegramAvailableCredit(
    string Month, string AvailabilityBasis, decimal KnownAvailable, bool IsComplete,
    int UnknownLimitAccounts, int TotalAccounts, bool Truncated,
    IReadOnlyList<TelegramCreditAccount> Accounts);

public sealed record TelegramFinancialSummary(
    string Month, string Scope, decimal Income, decimal Expense, decimal Net);

public sealed record TelegramCutoffAccount(
    int AccountId, string Name, decimal Estimated, decimal Paid, decimal Pending,
    DateTime? PeriodStart, DateTime? PeriodEnd);

public sealed record TelegramBudgetThreshold(int ThresholdId, string Name, decimal Percent);

public sealed record TelegramBudgetStatus(
    int BudgetId, string Name, string PeriodKey, int? CategoryId, int? SubcategoryId,
    bool Active, decimal AmountMxn, decimal Spent, decimal SpentPercent,
    decimal Committed, decimal CommittedPercent, decimal Projected, decimal ProjectedPercent,
    decimal Effective, decimal Forecast, decimal PercentUsed, decimal ThresholdPercent,
    decimal Remaining, decimal PlannedAmount, decimal Variance,
    int ItemsPending, int ItemsExecuted, int ItemsIgnored,
    decimal PlannedIncome, decimal CommittedIncome, decimal ProjectedIncome,
    string Status, TelegramBudgetThreshold? ReachedThreshold);

public sealed record TelegramBudgetResponse(
    string Month, string Timezone, int TotalBudgets, int ActiveBudgets,
    bool Truncated, IReadOnlyList<TelegramBudgetStatus> Budgets);

public sealed record TelegramCutoffPayments(
    string Month, string Timezone, string PaymentBasis,
    decimal Estimated, decimal Paid, decimal Pending, int TotalAccounts,
    bool Truncated, IReadOnlyList<TelegramCutoffAccount> Accounts);
