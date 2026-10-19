namespace GastosApp.Telegram.Tests;

/// <summary>
/// Console entry point kept for `dotnet run --project GastosApp.Telegram.Tests`.
/// <para>
/// This used to be top-level statements, which makes the compiler emit a global <c>Program</c> class.
/// That collided with the API's <c>Program</c> as soon as one assembly referenced both — which
/// <c>GastosApp.Backend.Tests</c> does, to run these checks under `dotnet test`.
/// </para>
/// </summary>
internal static class HarnessProgram
{
    public static async Task Main()
    {
        await NtfyNotificationTests.RunAsync();
        await TelegramFinancialQueryTests.RunAsync();
        await TelegramBudgetQueryTests.RunAsync();
        await TelegramAlertQueryTests.RunAsync();
        await TelegramConversationTests.RunAsync();
    }
}
