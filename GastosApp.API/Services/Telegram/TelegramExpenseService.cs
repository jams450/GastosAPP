using System.Globalization;
using GastosApp.AI.Intent;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;

namespace GastosApp.API.Services.Telegram;

/// <summary>
/// Comandos de gasto, borrador, confirmación/cancelación y catálogos para Telegram.
/// También crea el borrador a partir de una intención ya extraída (<see cref="HandleExpenseIntentAsync"/>).
/// Nada se escribe hasta que el usuario confirma.
/// La escritura pasa exclusivamente por <see cref="ITransactionService"/>.
/// </summary>
public sealed class TelegramExpenseService
{
    private const string MexicoTimeZoneId = "America/Mexico_City";
    private const int MaxDescriptionLength = 500;

    private const string HelpText = """
        Comandos disponibles:
        /ayuda, /start — esta ayuda
        /gasto <monto> <cuenta> [descripción] — crea un borrador de gasto
        /confirmar (sí, si) — confirma el borrador pendiente
        /cancelar (no) — cancela el borrador pendiente
        /pendiente — muestra el borrador pendiente
        /cuentas — lista tus cuentas activas
        /categorias — lista tus categorías activas

        También puedes escribir el gasto en lenguaje natural, por ejemplo: "gasté 200 en comida ayer".
        Nada se registra hasta que confirmes.
        """;

    private static readonly TimeZoneInfo MexicoTimeZone = ResolveMexicoTimeZone();

    private readonly IExpenseDraftService _drafts;
    private readonly ITransactionService _transactions;
    private readonly IAccountService _accounts;
    private readonly ICategoryService _categories;

    public TelegramExpenseService(
        IExpenseDraftService drafts,
        ITransactionService transactions,
        IAccountService accounts,
        ICategoryService categories)
    {
        _drafts = drafts;
        _transactions = transactions;
        _accounts = accounts;
        _categories = categories;
    }

    public async Task<string> ExecuteCommandAsync(TelegramCommand command, TelegramIdentity identity, CancellationToken cancellationToken)
    {
        return command.Kind switch
        {
            TelegramCommandKind.Help => HelpText,
            TelegramCommandKind.Unknown => "No conozco ese comando.\n\n" + HelpText,
            TelegramCommandKind.Confirm => await ConfirmAsync(identity, cancellationToken),
            TelegramCommandKind.Cancel => await CancelAsync(identity, cancellationToken),
            TelegramCommandKind.Pending => await DescribePendingAsync(identity, cancellationToken),
            TelegramCommandKind.Accounts => await ListAccountsAsync(identity, cancellationToken),
            TelegramCommandKind.Categories => await ListCategoriesAsync(identity, cancellationToken),
            TelegramCommandKind.Expense => await HandleExpenseCommandAsync(command, identity, cancellationToken),
            _ => HelpText
        };
    }

    private async Task<string> HandleExpenseCommandAsync(TelegramCommand command, TelegramIdentity identity, CancellationToken cancellationToken)
    {
        if (!TryParseAmount(command.Amount, out var amount))
        {
            return "Indica un monto mayor a cero. Ejemplo: /gasto 200 efectivo café";
        }

        var accounts = await GetExpenseAccountsAsync(identity.UserId, cancellationToken);
        if (accounts.Count == 0)
        {
            return "No tienes cuentas activas (no crédito) para registrar gastos.";
        }

        var tokens = (command.Arguments ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length == 0)
        {
            return "Indica la cuenta. Ejemplo: /gasto 200 efectivo café";
        }

        var (account, error, description) = ResolveAccountWithRemainder(tokens, accounts);
        if (account is null)
        {
            return error ?? "No encontré esa cuenta.";
        }

        var draft = await CreateDraftAsync(
            identity,
            amount,
            account,
            Truncate(description, MaxDescriptionLength),
            null,
            TodayInMexicoUtc(),
            TelegramExpenseDraftSource.Manual,
            cancellationToken);

        return DescribeDraft(draft, account.Name);
    }

    /// <summary>
    /// Crea el borrador para una intención <see cref="IntentKind.RegistrarGasto"/> ya extraída.
    /// Los catálogos se reciben resueltos para no volver a consultarlos.
    /// </summary>
    public async Task<string> HandleExpenseIntentAsync(
        IntentResult intent,
        TelegramIdentity identity,
        IReadOnlyList<Account> accounts,
        IReadOnlyList<Category> categories,
        CancellationToken cancellationToken)
    {
        if (intent.Monto is null || intent.Monto <= 0)
        {
            return "El monto debe ser mayor a cero.";
        }

        var (account, error) = ResolveSingleAccount(intent.Cuenta, accounts);
        if (account is null)
        {
            return error ?? "No encontré esa cuenta. Usa /cuentas para ver los nombres disponibles.";
        }

        // Categoría presente pero inválida/ambigua: se pide aclaración y NO se crea borrador.
        // (La categoría es opcional: solo cuando el usuario no mencionó ninguna se crea sin ella.)
        var (category, categoryError) = ResolveSingleCategory(intent.Categoria, categories);
        if (categoryError is not null)
        {
            return categoryError;
        }

        // Fecha presente pero fuera de rango: se pide aclaración y NO se sustituye por hoy.
        // Fecha ausente => hoy (en America/Mexico_City).
        var (transactionDate, dateError) = ResolveDateUtc(intent.Fecha);
        if (dateError is not null)
        {
            return dateError;
        }

        return DescribeDraft(
            await CreateDraftAsync(
                identity,
                decimal.Round(intent.Monto.Value, 2, MidpointRounding.AwayFromZero),
                account,
                Truncate(intent.Descripcion, MaxDescriptionLength),
                category,
                transactionDate!.Value,
                TelegramExpenseDraftSource.Ai,
                cancellationToken),
            account.Name);
    }

    private async Task<string> ConfirmAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var chatId = identity.TelegramChatId;
        var pending = await _drafts.GetPendingAsync(chatId, cancellationToken);

        // La confirmación exige el mismo chat y la misma identidad.
        if (pending is null || pending.TelegramIdentityId != identity.TelegramIdentityId)
        {
            return "No hay ningún gasto pendiente por confirmar.";
        }

        try
        {
            var result = await _drafts.ConfirmAsync(
                pending.DraftId,
                chatId,
                draft => CreateExpenseAsync(draft, identity.UserId, cancellationToken),
                cancellationToken);

            return result.Outcome switch
            {
                ExpenseDraftConfirmationOutcome.Confirmed =>
                    $"Gasto registrado: {FormatMoney(result.Draft!.Amount)} en {result.Draft.RawAccountName ?? "la cuenta"}.",
                ExpenseDraftConfirmationOutcome.Expired =>
                    "El borrador expiró. Crea uno nuevo con /gasto.",
                ExpenseDraftConfirmationOutcome.NotPending =>
                    "Ese borrador ya no está pendiente.",
                _ => "No encontré el borrador pendiente."
            };
        }
        catch (ArgumentException exception)
        {
            // Validación de BusinessLogic: mensaje funcional y el borrador permanece pendiente.
            return exception.Message;
        }
    }

    private Task<Transaction> CreateExpenseAsync(TelegramExpenseDraft draft, int userId, CancellationToken cancellationToken)
    {
        if (draft.AccountId is null)
        {
            throw new ArgumentException("El borrador no tiene una cuenta válida.");
        }

        var transaction = new Transaction
        {
            AccountId = draft.AccountId.Value,
            CategoryId = draft.CategoryId,
            SubcategoryId = draft.SubcategoryId,
            MerchantId = draft.MerchantId,
            Amount = draft.Amount,
            Description = draft.Description,
            TransactionDate = draft.TransactionDate
        };

        return _transactions.CreateExpenseAsync(transaction, userId);
    }

    private async Task<string> CancelAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var cancelled = await _drafts.CancelAsync(identity.TelegramChatId, cancellationToken);
        return cancelled ? "Gasto cancelado." : "No hay ningún gasto pendiente por cancelar.";
    }

    private async Task<string> DescribePendingAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var pending = await _drafts.GetPendingAsync(identity.TelegramChatId, cancellationToken);
        if (pending is null || pending.TelegramIdentityId != identity.TelegramIdentityId)
        {
            return "No hay ningún gasto pendiente.";
        }

        return $"Pendiente: {FormatMoney(pending.Amount)} en {pending.RawAccountName ?? "la cuenta"} ({FormatDate(pending.TransactionDate)}).\n" +
               "Responde sí para confirmar o no para cancelar.";
    }

    private async Task<string> ListAccountsAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var accounts = await GetExpenseAccountsAsync(identity.UserId, cancellationToken);
        if (accounts.Count == 0)
        {
            return "No tienes cuentas activas (no crédito).";
        }

        var lines = accounts.Select(a => $"- {a.Name}");
        return "Cuentas disponibles:\n" + string.Join('\n', lines);
    }

    private async Task<string> ListCategoriesAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var categories = await GetActiveCategoriesAsync(identity.UserId, cancellationToken);
        if (categories.Count == 0)
        {
            return "No tienes categorías activas.";
        }

        var lines = categories.Select(c => $"- {c.Name}");
        return "Categorías disponibles:\n" + string.Join('\n', lines);
    }

    private async Task<TelegramExpenseDraft> CreateDraftAsync(
        TelegramIdentity identity,
        decimal amount,
        Account account,
        string? description,
        Category? category,
        DateTime transactionDateUtc,
        string source,
        CancellationToken cancellationToken)
    {
        var draft = new TelegramExpenseDraft
        {
            TelegramIdentityId = identity.TelegramIdentityId,
            ChatId = identity.TelegramChatId,
            Amount = amount,
            TransactionDate = transactionDateUtc,
            AccountId = account.AccountId,
            RawAccountName = account.Name,
            CategoryId = category?.CategoryId,
            RawCategoryName = category?.Name,
            Description = description,
            Source = source,
            Intent = TelegramExpenseDraftIntent.Expense
        };

        return await _drafts.CreateAsync(draft, cancellationToken);
    }

    // Catálogos usados por los comandos y por el orquestador (texto libre) antes de extraer la intención.
    public async Task<IReadOnlyList<Account>> GetExpenseAccountsAsync(int userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var accounts = await _accounts.GetAllActiveByUserIdAsync(userId);
        return accounts
            .Where(a => a.Active && !a.IsCredit && a.UserId == userId)
            .ToList();
    }

    public async Task<IReadOnlyList<Category>> GetActiveCategoriesAsync(int userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var categories = await _categories.GetAllActiveByUserIdAsync(userId);
        return categories.Where(c => c.Active).ToList();
    }

    private static (Account? Account, string? Error, string? Description) ResolveAccountWithRemainder(
        IReadOnlyList<string> tokens,
        IReadOnlyList<Account> accounts)
    {
        // Los nombres de cuenta pueden tener espacios: se prueban prefijos de 1..4 tokens.
        for (var length = 1; length <= Math.Min(4, tokens.Count); length++)
        {
            var candidate = string.Join(' ', tokens.Take(length));
            var matches = accounts
                .Where(a => string.Equals(a.Name.Trim(), candidate, StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (matches.Count > 1)
            {
                return (null, "Hay más de una cuenta con ese nombre. Usa /cuentas para ver los nombres exactos.", null);
            }

            if (matches.Count == 1)
            {
                var remainder = tokens.Count > length ? string.Join(' ', tokens.Skip(length)) : null;
                return (matches[0], null, string.IsNullOrWhiteSpace(remainder) ? null : remainder);
            }
        }

        return (null, "No encontré esa cuenta. Usa /cuentas para ver los nombres disponibles.", null);
    }

    private static (Account? Account, string? Error) ResolveSingleAccount(string? name, IReadOnlyList<Account> accounts)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return (null, "¿En qué cuenta fue el gasto? Ejemplo: /gasto 200 efectivo café");
        }

        var matches = accounts
            .Where(a => string.Equals(a.Name.Trim(), name.Trim(), StringComparison.OrdinalIgnoreCase))
            .ToList();

        return matches.Count switch
        {
            0 => (null, "No encontré esa cuenta. Usa /cuentas para ver los nombres disponibles."),
            > 1 => (null, "Hay más de una cuenta con ese nombre. Usa /cuentas para ver los nombres exactos."),
            _ => (matches[0], null)
        };
    }

    private static (Category? Category, string? Error) ResolveSingleCategory(string? name, IReadOnlyList<Category> categories)
    {
        // Categoría ausente: opcional, se crea sin ella.
        if (string.IsNullOrWhiteSpace(name)) return (null, null);

        var matches = categories
            .Where(c => string.Equals(c.Name.Trim(), name.Trim(), StringComparison.OrdinalIgnoreCase))
            .ToList();

        return matches.Count switch
        {
            0 => (null, "No encontré esa categoría. Usa /categorias para ver los nombres disponibles."),
            > 1 => (null, "Hay más de una categoría con ese nombre. Usa /categorias para ver los nombres exactos."),
            _ => (matches[0], null)
        };
    }

    private static bool TryParseAmount(string? raw, out decimal amount)
    {
        amount = 0m;
        if (string.IsNullOrWhiteSpace(raw)) return false;

        var cleaned = raw.Trim().Replace("$", string.Empty).Replace(" ", string.Empty).Replace(",", string.Empty);
        if (!decimal.TryParse(cleaned, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)) return false;
        if (parsed <= 0) return false;

        amount = decimal.Round(parsed, 2, MidpointRounding.AwayFromZero);
        return amount > 0;
    }

    private static DateTime TodayInMexicoUtc()
    {
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, MexicoTimeZone);
        var todayLocal = DateTime.SpecifyKind(nowLocal.Date, DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(todayLocal, MexicoTimeZone);
    }

    private static (DateTime? DateUtc, string? Error) ResolveDateUtc(DateOnly? date)
    {
        var todayLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, MexicoTimeZone).Date;
        if (date is null)
        {
            // Fecha ausente => hoy.
            return (TodayInMexicoUtc(), null);
        }

        var value = date.Value.ToDateTime(TimeOnly.MinValue);
        if (value < todayLocal.AddDays(-366) || value > todayLocal.AddDays(1))
        {
            // Fecha presente pero fuera de rango: aclarar, nunca sustituir por hoy en silencio.
            return (null, "La fecha está fuera del rango permitido. Indica una fecha de los últimos 12 meses (máximo mañana).");
        }

        return (TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(value, DateTimeKind.Unspecified), MexicoTimeZone), null);
    }

    private static string DescribeDraft(TelegramExpenseDraft draft, string accountName) =>
        $"Borrador: {FormatMoney(draft.Amount)} en {accountName} ({FormatDate(draft.TransactionDate)}).\n" +
        "Responde sí para confirmar o no para cancelar.";

    private static string FormatMoney(decimal amount) =>
        "$" + amount.ToString("0.00", CultureInfo.InvariantCulture);

    private static string FormatDate(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), MexicoTimeZone)
            .ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string? Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    private static TimeZoneInfo ResolveMexicoTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(MexicoTimeZoneId);
        }
        catch (TimeZoneNotFoundException)
        {
            // ponytail: fallback fijo (sin DST). México abolió el horario de verano en 2022.
            return TimeZoneInfo.CreateCustomTimeZone("MX-Fallback", TimeSpan.FromHours(-6), "Mexico", "Mexico");
        }
        catch (InvalidTimeZoneException)
        {
            return TimeZoneInfo.CreateCustomTimeZone("MX-Fallback", TimeSpan.FromHours(-6), "Mexico", "Mexico");
        }
    }
}
