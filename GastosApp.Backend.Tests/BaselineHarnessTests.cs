using GastosApp.Dashboard.Tests;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Re-runs the two pre-existing console harnesses under <c>dotnet test</c>.
/// <para>
/// They were the only regression net in this repository and neither was compiled by the solution
/// build. Invoking their entry points here gives every later slice a runner that fails the build,
/// while <c>dotnet run --project ...</c> keeps working exactly as before.
/// </para>
/// <para>
/// The checks are deterministic and offline, so a failure here is a real regression, never a
/// database or network condition. Neither harness proves behaviour that only PostgreSQL can prove.
/// </para>
/// </summary>
public class BaselineHarnessTests
{
    [Fact]
    public Task Dashboard_projection_suite_passes() => DashboardProjectionTests.RunAsync();

    [Fact]
    public Task Budget_suggestion_matching_suite_passes() => BudgetSuggestionTests.RunAsync();

    [Fact]
    public Task Budget_suggestion_selection_suite_passes() => BudgetSuggestionTests.RunSelectionAsync();

    [Fact]
    public Task Cash_flow_classification_suite_passes() => CashFlowClassificationTests.RunAsync();

    [Fact]
    public Task Account_credit_snapshot_suite_passes() => AccountCreditSnapshotTests.RunAsync();

    [Fact]
    public Task Ntfy_notification_suite_passes() => NtfyNotificationTests.RunAsync();

    [Fact]
    public Task Telegram_financial_query_suite_passes() => TelegramFinancialQueryTests.RunAsync();

    [Fact]
    public Task Telegram_budget_query_suite_passes() => TelegramBudgetQueryTests.RunAsync();

    [Fact]
    public Task Telegram_alert_query_suite_passes() => TelegramAlertQueryTests.RunAsync();

    [Fact]
    public Task Telegram_conversation_outcomes_pass() => TelegramConversationTests.RunAsync();
}
