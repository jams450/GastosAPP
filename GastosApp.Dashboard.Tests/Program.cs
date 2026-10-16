using GastosApp.Dashboard.Tests;

await DashboardProjectionTests.RunAsync();
await BudgetSuggestionTests.RunAsync();
await BudgetSuggestionTests.RunSelectionAsync();

Console.WriteLine("Dashboard projection and budget suggestion tests passed.");
