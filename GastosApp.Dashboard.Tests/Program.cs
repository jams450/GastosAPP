using GastosApp.Dashboard.Tests;

await DashboardProjectionTests.RunAsync();
await BudgetSuggestionTests.RunAsync();
await BudgetSuggestionTests.RunSelectionAsync();
await CashFlowClassificationTests.RunAsync();

Console.WriteLine("Dashboard projection, budget suggestion and cash flow classification tests passed.");
