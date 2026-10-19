// Console harness retained as-is for `dotnet run`; GastosApp.Backend.Tests calls the same
// five entry points through `dotnet test`, so both surfaces run identical checks.
await NtfyNotificationTests.RunAsync();
await TelegramFinancialQueryTests.RunAsync();
await TelegramBudgetQueryTests.RunAsync();
await TelegramAlertQueryTests.RunAsync();
await TelegramConversationTests.RunAsync();
