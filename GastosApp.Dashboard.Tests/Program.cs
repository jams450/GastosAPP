namespace GastosApp.Dashboard.Tests;

/// <summary>
/// Console entry point kept for `dotnet run --project GastosApp.Dashboard.Tests`.
/// <para>
/// Converted from top-level statements: those emit a global <c>Program</c> class, which collided
/// with the API's <c>Program</c> once <c>GastosApp.Backend.Tests</c> referenced both.
/// </para>
/// </summary>
internal static class HarnessProgram
{
    public static async Task Main()
    {
        await DashboardProjectionTests.RunAsync();
        await BudgetSuggestionTests.RunAsync();
        await BudgetSuggestionTests.RunSelectionAsync();
        await CashFlowClassificationTests.RunAsync();
        await AccountCreditSnapshotTests.RunAsync();

        Console.WriteLine("Dashboard projection, budget suggestion, cash flow classification and account credit snapshot tests passed.");
    }
}
