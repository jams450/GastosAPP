using GastosApp.Dashboard.Tests;

await DashboardProjectionTests.RunAsync();
await BudgetSuggestionTests.RunAsync();
await BudgetSuggestionTests.RunSelectionAsync();
await CashFlowClassificationTests.RunAsync();
await AccountCreditSnapshotTests.RunAsync();

Console.WriteLine("Dashboard projection, budget suggestion, cash flow classification and account credit snapshot tests passed.");
