using System.Globalization;
using GastosApp.AI.Intent;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.Extensions.Logging;

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
    private const string SinValor = "—";
    private const int ExpenseFieldCount = 6;

    private const string ExpenseSyntax =
        "Sintaxis: /gasto <monto> | <cuenta> | <categoría> [| <subcategoría>] [| <comercio>] [| <descripción>]\n" +
        "Ejemplo: /gasto 200 | efectivo | mascotas | higiene | amazon | arena para gato";

    private const string HelpText = """
        Comandos disponibles:
        /ayuda, /start — esta ayuda
        /gasto <monto> | <cuenta> | <categoría> [| <subcategoría>] [| <comercio>] [| <descripción>] — crea un borrador de gasto
        /confirmar (sí, si) — confirma el borrador pendiente
        /cancelar (no) — cancela el borrador pendiente
        /pendiente — muestra el borrador pendiente
        /cuentas — lista tus cuentas activas
        /categorias — lista tus categorías activas

        Ejemplo: /gasto 200 | efectivo | mascotas | higiene | amazon | arena para gato
        Los campos van en ese orden. Puedes cortar la línea si los últimos no aplican; para saltar
        uno intermedio déjalo vacío: /gasto 200 | efectivo | mascotas | | amazon
        La categoría es obligatoria y la fecha/hora se toman del servidor si no las indicas.

        También puedes escribir el gasto en lenguaje natural, por ejemplo: "gasté 200 en comida ayer".
        Nada se registra hasta que confirmes.
        """;

    private static readonly TimeZoneInfo MexicoTimeZone = ResolveMexicoTimeZone();

    private readonly IExpenseDraftService _drafts;
    private readonly ITransactionService _transactions;
    private readonly IAccountService _accounts;
    private readonly ICategoryService _categories;
    private readonly ISubcategoryService _subcategories;
    private readonly IMerchantService _merchants;
    private readonly ILogger<TelegramExpenseService> _logger;

    public TelegramExpenseService(
        IExpenseDraftService drafts,
        ITransactionService transactions,
        IAccountService accounts,
        ICategoryService categories,
        ISubcategoryService subcategories,
        IMerchantService merchants,
        ILogger<TelegramExpenseService> logger)
    {
        _drafts = drafts;
        _transactions = transactions;
        _accounts = accounts;
        _categories = categories;
        _subcategories = subcategories;
        _merchants = merchants;
        _logger = logger;
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
        // Campos posicionales separados por '|'. Los segmentos vacíos se tratan como ausentes.
        var segments = (command.Arguments ?? string.Empty)
            .Split('|', StringSplitOptions.TrimEntries)
            .Select(segment => segment.Trim())
            .ToList();

        if (segments.Count > ExpenseFieldCount)
        {
            return $"Usa como máximo {ExpenseFieldCount} campos separados por |.\n{ExpenseSyntax}";
        }

        while (segments.Count < ExpenseFieldCount)
        {
            segments.Add(string.Empty);
        }

        if (!TryParseAmount(segments[0], out var amount))
        {
            return $"Indica un monto mayor a cero.\n{ExpenseSyntax}";
        }

        var accounts = await GetExpenseAccountsAsync(identity.UserId, cancellationToken);
        if (accounts.Count == 0)
        {
            return "No tienes cuentas activas para registrar gastos.";
        }

        var (account, accountError) = ResolveSingleAccount(segments[1], accounts);
        if (account is null)
        {
            return (accountError ?? "No encontré esa cuenta.") + "\n" + ExpenseSyntax;
        }

        var categories = await GetActiveCategoriesAsync(identity.UserId, cancellationToken);
        var (category, categoryError) = ResolveSingleCategory(segments[2], categories);
        if (category is null)
        {
            return (categoryError ?? "Falta la categoría del gasto.") + "\n" + ExpenseSyntax;
        }

        var subcategories = await GetActiveSubcategoriesAsync(identity.UserId, cancellationToken);
        var (subcategory, subcategoryError) = ResolveSingleSubcategory(segments[3], category, subcategories);
        if (subcategoryError is not null)
        {
            return subcategoryError;
        }

        var merchants = await GetActiveMerchantsAsync(identity.UserId, cancellationToken);
        var (merchant, merchantError) = ResolveSingleMerchant(segments[4], merchants);
        if (merchantError is not null)
        {
            return merchantError;
        }

        var draft = await CreateDraftAsync(
            identity,
            amount,
            account,
            Truncate(segments[5], MaxDescriptionLength),
            category,
            subcategory,
            merchant,
            DateTime.UtcNow,
            TelegramExpenseDraftSource.Manual,
            cancellationToken);

        return DescribeDraft(draft);
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
        IReadOnlyList<Subcategory> subcategories,
        IReadOnlyList<Merchant> merchants,
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

        // Categoría obligatoria: sin categoría resuelta no se crea borrador.
        var (category, categoryError) = ResolveSingleCategory(intent.Categoria, categories);
        if (category is null)
        {
            return categoryError ?? "Falta la categoría del gasto. Usa /categorias para ver las disponibles.";
        }

        // Subcategoría y comercio son opcionales, pero si el usuario los mencionó deben resolver
        // dentro de su catálogo: nunca se sustituyen en silencio.
        var (subcategory, subcategoryError) = ResolveSingleSubcategory(intent.Subcategoria, category, subcategories);
        if (subcategoryError is not null)
        {
            return subcategoryError;
        }

        var (merchant, merchantError) = ResolveSingleMerchant(intent.Comercio, merchants);
        if (merchantError is not null)
        {
            return merchantError;
        }

        // Fecha presente pero fuera de rango: se pide aclaración y NO se sustituye por hoy.
        // Fecha u hora ausentes => fecha de hoy y hora actual del servidor (America/Mexico_City).
        var (transactionDate, dateError) = ResolveDateUtc(intent.Fecha, intent.Hora);
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
                subcategory,
                merchant,
                transactionDate!.Value,
                TelegramExpenseDraftSource.Ai,
                cancellationToken));
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
                    "Gasto registrado:\n" + FormatDraftValues(result.Draft!),
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
        catch (Exception exception)
        {
            // La transacción de confirmación ya hizo rollback: el borrador sigue pendiente.
            // Nunca se deja al usuario sin respuesta (p. ej. fallo al resolver el ciclo de una cuenta crédito).
            _logger.LogError("Telegram expense confirmation failed: {ErrorType}", exception.GetType().Name);
            return "No pude registrar el gasto. El borrador sigue pendiente: reintenta con /confirmar o cancelar con /cancelar.";
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

        return "Pendiente:\n" + FormatDraftValues(pending) + "\nResponde sí para confirmar o no para cancelar.";
    }

    private async Task<string> ListAccountsAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var accounts = await GetExpenseAccountsAsync(identity.UserId, cancellationToken);
        if (accounts.Count == 0)
        {
            return "No tienes cuentas activas.";
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
        Subcategory? subcategory,
        Merchant? merchant,
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
            SubcategoryId = subcategory?.SubcategoryId,
            RawSubcategoryName = subcategory?.Name,
            MerchantId = merchant?.MerchantId,
            RawMerchantName = merchant?.Name,
            Description = description,
            Source = source,
            Intent = TelegramExpenseDraftIntent.Expense
        };

        return await _drafts.CreateAsync(draft, cancellationToken);
    }

    // Catálogos usados por los comandos y por el orquestador (texto libre) antes de extraer la intención.
    // Incluye cuentas crédito: el gasto se registra como cargo revolvente (sin MSI).
    public async Task<IReadOnlyList<Account>> GetExpenseAccountsAsync(int userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var accounts = await _accounts.GetAllActiveByUserIdAsync(userId);
        return accounts
            .Where(a => a.Active && a.UserId == userId)
            .ToList();
    }

    public async Task<IReadOnlyList<Category>> GetActiveCategoriesAsync(int userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var categories = await _categories.GetAllActiveByUserIdAsync(userId);
        return categories.Where(c => c.Active).ToList();
    }

    public async Task<IReadOnlyList<Subcategory>> GetActiveSubcategoriesAsync(int userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return (await _subcategories.GetByUserIdAsync(userId, true)).ToList();
    }

    public async Task<IReadOnlyList<Merchant>> GetActiveMerchantsAsync(int userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return (await _merchants.GetByUserIdAsync(userId, true)).ToList();
    }

    private static (Account? Account, string? Error) ResolveSingleAccount(string? name, IReadOnlyList<Account> accounts)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return (null, "Falta la cuenta en el segundo campo.");
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
        // Categoría obligatoria: ausente se trata como error, no como "sin categoría".
        if (string.IsNullOrWhiteSpace(name))
        {
            return (null, "Falta la categoría del gasto. Usa /categorias para ver las disponibles.");
        }

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

    private static (Subcategory? Subcategory, string? Error) ResolveSingleSubcategory(
        string? name,
        Category category,
        IReadOnlyList<Subcategory> subcategories)
    {
        // Subcategoría opcional: solo se resuelve si el usuario la mencionó, y siempre dentro de su categoría.
        if (string.IsNullOrWhiteSpace(name)) return (null, null);

        var matches = subcategories
            .Where(s => s.CategoryId == category.CategoryId
                && string.Equals(s.Name.Trim(), name.Trim(), StringComparison.OrdinalIgnoreCase))
            .ToList();

        return matches.Count switch
        {
            0 => (null, $"No encontré la subcategoría \"{name.Trim()}\" en {category.Name}. Puedes registrarla sin subcategoría."),
            > 1 => (null, $"Hay más de una subcategoría \"{name.Trim()}\" en {category.Name}."),
            _ => (matches[0], null)
        };
    }

    private static (Merchant? Merchant, string? Error) ResolveSingleMerchant(string? name, IReadOnlyList<Merchant> merchants)
    {
        // Comercio opcional: solo se resuelve si el usuario lo mencionó.
        if (string.IsNullOrWhiteSpace(name)) return (null, null);

        var matches = merchants
            .Where(m => string.Equals(m.Name.Trim(), name.Trim(), StringComparison.OrdinalIgnoreCase))
            .ToList();

        return matches.Count switch
        {
            0 => (null, $"No encontré el comercio \"{name.Trim()}\". Puedes registrarlo sin comercio."),
            > 1 => (null, "Hay más de un comercio con ese nombre. Indica el nombre exacto."),
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

    private static (DateTime? DateUtc, string? Error) ResolveDateUtc(DateOnly? date, TimeOnly? hora)
    {
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, MexicoTimeZone);
        var todayLocal = nowLocal.Date;

        // Fecha ausente => hoy. Hora ausente => hora actual del servidor (America/Mexico_City).
        var day = date ?? DateOnly.FromDateTime(todayLocal);
        var time = hora ?? TimeOnly.FromDateTime(nowLocal);

        if (day < DateOnly.FromDateTime(todayLocal.AddDays(-366)) || day > DateOnly.FromDateTime(todayLocal.AddDays(1)))
        {
            // Fecha presente pero fuera de rango: aclarar, nunca sustituir por hoy en silencio.
            return (null, "La fecha está fuera del rango permitido. Indica una fecha de los últimos 12 meses (máximo mañana).");
        }

        var value = DateTime.SpecifyKind(day.ToDateTime(time), DateTimeKind.Unspecified);
        return (TimeZoneInfo.ConvertTimeToUtc(value, MexicoTimeZone), null);
    }

    private static string DescribeDraft(TelegramExpenseDraft draft) =>
        "Borrador:\n" + FormatDraftValues(draft) + "\nResponde sí para confirmar o no para cancelar.";

    private static string FormatDraftValues(TelegramExpenseDraft draft)
    {
        var lines = new List<string>
        {
            $"- Monto: {FormatMoney(draft.Amount)}",
            $"- Cuenta: {draft.RawAccountName ?? SinValor}",
            $"- Categoría: {draft.RawCategoryName ?? SinValor}",
            $"- Subcategoría: {draft.RawSubcategoryName ?? SinValor}",
            $"- Comercio: {draft.RawMerchantName ?? SinValor}",
            $"- Fecha: {FormatDate(draft.TransactionDate)}"
        };

        if (!string.IsNullOrWhiteSpace(draft.Description))
        {
            lines.Add($"- Descripción: {draft.Description}");
        }

        return string.Join('\n', lines);
    }

    private static string FormatMoney(decimal amount) =>
        "$" + amount.ToString("0.00", CultureInfo.InvariantCulture);

    private static string FormatDate(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), MexicoTimeZone)
            .ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);

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
