namespace GastosApp.API.Services.Telegram;

public enum TelegramCommandKind
{
    /// <summary>No es comando ni atajo: va al camino de texto libre/IA.</summary>
    None,

    /// <summary>Comando desconocido: no consume IA, responde ayuda.</summary>
    Unknown,

    Help,
    Expense,
    Confirm,
    Cancel,
    Pending,
    Accounts,
    Categories
}

public sealed record TelegramCommand(TelegramCommandKind Kind, string? Arguments = null);

/// <summary>
/// Parser determinista de comandos manuales y atajos. No invoca IA.
/// </summary>
public static class TelegramCommandParser
{
    private static readonly string[] ConfirmAliases = ["/confirmar", "confirmar", "si", "sí", "sí.", "si."];
    private static readonly string[] CancelAliases = ["/cancelar", "cancelar", "no", "no."];

    public static TelegramCommand Parse(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return new TelegramCommand(TelegramCommandKind.None);

        var trimmed = text.Trim();
        if (trimmed.StartsWith('/'))
        {
            var firstSpace = trimmed.IndexOf(' ');
            var head = (firstSpace < 0 ? trimmed : trimmed[..firstSpace]).ToLowerInvariant();
            var rest = firstSpace < 0 ? "" : trimmed[(firstSpace + 1)..].Trim();

            return head switch
            {
                "/ayuda" or "/help" or "/start" => new TelegramCommand(TelegramCommandKind.Help),
                "/gasto" => ParseExpense(rest),
                "/confirmar" => new TelegramCommand(TelegramCommandKind.Confirm),
                "/cancelar" => new TelegramCommand(TelegramCommandKind.Cancel),
                "/pendiente" => new TelegramCommand(TelegramCommandKind.Pending),
                "/cuentas" => new TelegramCommand(TelegramCommandKind.Accounts),
                "/categorias" => new TelegramCommand(TelegramCommandKind.Categories),
                _ => new TelegramCommand(TelegramCommandKind.Unknown)
            };
        }

        // Atajos de confirmación/cancelación resueltos ANTES de llamar al LLM.
        var normalized = trimmed.ToLowerInvariant();
        if (ConfirmAliases.Contains(normalized)) return new TelegramCommand(TelegramCommandKind.Confirm);
        if (CancelAliases.Contains(normalized)) return new TelegramCommand(TelegramCommandKind.Cancel);

        return new TelegramCommand(TelegramCommandKind.None);
    }

    private static TelegramCommand ParseExpense(string rest)
    {
        // El parser no interpreta campos: TelegramExpenseService divide el contenido por '|'
        // (monto | cuenta | categoría | subcategoría | comercio | descripción).
        return new TelegramCommand(
            TelegramCommandKind.Expense,
            string.IsNullOrWhiteSpace(rest) ? null : rest);
    }
}
