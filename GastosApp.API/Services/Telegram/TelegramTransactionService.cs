using System.Globalization;
using GastosApp.AI.Intent;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Services;
using GastosApp.BusinessLogic.Services.Catalog;
using GastosApp.Models.Entities;
using Microsoft.Extensions.Logging;

namespace GastosApp.API.Services.Telegram;

/// <summary>
/// Comandos de gasto e ingreso, borrador, confirmación/cancelación y catálogos para Telegram.
/// También crea el borrador a partir de una intención ya extraída
/// (<see cref="HandleExpenseIntentAsync"/> / <see cref="HandleIncomeIntentAsync"/>).
/// Nada se escribe hasta que el usuario confirma.
/// La escritura pasa exclusivamente por <see cref="ITransactionService"/>.
/// </summary>
public sealed class TelegramTransactionService
{
    private const string MexicoTimeZoneId = "America/Mexico_City";
    private const int MaxDescriptionLength = 500;
    private const string SinValor = "—";
    private const int ExpenseFieldCount = 6;
    private const string CategoryTypeExpense = "expense";
    private const string CategoryTypeIncome = "income";

    // El borrador de Telegram no captura asignaciones a mensualidades: un ingreso a cuenta de crédito
    // no puede completarse por este canal.
    private const string CreditIncomeBlockedMessage =
        "Los ingresos a una cuenta de crédito requieren asignar una mensualidad y ese flujo no está disponible por Telegram. Usa una cuenta que no sea de crédito o regístralo en la aplicación.";

    private const string NoIncomeCategoriesMessage =
        "No tienes categorías de ingreso. Créalas en la aplicación (tipo ingreso) y vuelve a intentarlo.";

    private const string ExpenseSyntax =
        "Sintaxis: /gasto <monto>; <cuenta>; <categoría> [; <subcategoría>] [; <comercio>] [; <descripción>]\n" +
        "Ejemplo: /gasto 200; efectivo; mascotas; higiene; amazon; arena para gato";

    private const string IncomeSyntax =
        "Sintaxis: /ingreso <monto>; <cuenta>; <categoría> [; <subcategoría>] [; <comercio>] [; <descripción>]\n" +
        "Ejemplo: /ingreso 500; efectivo; salario; ;; quincena";

    private const string HelpText = """
        Comandos disponibles:
        /ayuda, /start — esta ayuda
        /gasto <monto>; <cuenta>; <categoría> [; <subcategoría>] [; <comercio>] [; <descripción>] — crea un borrador de gasto
        /ingreso <monto>; <cuenta>; <categoría> [; <subcategoría>] [; <comercio>] [; <descripción>] — crea un borrador de ingreso
        /confirmar (sí, si) — confirma el borrador pendiente
        /cancelar (no) — cancela el borrador pendiente
        /pendiente — muestra el borrador pendiente
        /cuentas — lista tus cuentas activas
        /categorias — lista tus categorías activas
        /subcategorias — lista tus subcategorías activas (con su categoría)
        /comercios — lista tus comercios activos

        Ejemplo: /gasto 200; efectivo; mascotas; higiene; amazon; arena para gato
        Ejemplo: /ingreso 500; efectivo; salario; ;; quincena
        Los campos van en ese orden, separados por punto y coma (;). Puedes cortar la línea si los
        últimos no aplican; para saltar uno intermedio déjalo vacío: /gasto 200; efectivo; mascotas; ; amazon
        Si el nombre de la cuenta, categoría, subcategoría o comercio no coincide exactamente, se
        interpreta por aproximación y, si hay duda, se te muestran opciones.
        La categoría es obligatoria (de gasto para /gasto y de ingreso para /ingreso) y la fecha/hora
        se toman del servidor si no las indicas.
        Los ingresos a una cuenta de crédito no están disponibles por Telegram: usa una cuenta que no
        sea de crédito o regístralos en la aplicación.

        También puedes escribir el gasto o el ingreso en lenguaje natural, por ejemplo:
        "gasté 200 en comida ayer" o "recibí 500 de salario hoy".
        Nada se registra hasta que confirmes.
        """;

    private static readonly TimeZoneInfo MexicoTimeZone = ResolveMexicoTimeZone();

    private readonly ITelegramDraftService _drafts;
    private readonly ITransactionService _transactions;
    private readonly IAccountService _accounts;
    private readonly ICategoryService _categories;
    private readonly ISubcategoryService _subcategories;
    private readonly IMerchantService _merchants;
    private readonly ILogger<TelegramTransactionService> _logger;

    public TelegramTransactionService(
        ITelegramDraftService drafts,
        ITransactionService transactions,
        IAccountService accounts,
        ICategoryService categories,
        ISubcategoryService subcategories,
        IMerchantService merchants,
        ILogger<TelegramTransactionService> logger)
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
            TelegramCommandKind.Subcategories => await ListSubcategoriesAsync(identity, cancellationToken),
            TelegramCommandKind.Merchants => await ListMerchantsAsync(identity, cancellationToken),
            TelegramCommandKind.Expense => await HandleDraftCommandAsync(command, identity, TelegramDraftIntent.Expense, cancellationToken),
            TelegramCommandKind.Income => await HandleDraftCommandAsync(command, identity, TelegramDraftIntent.Income, cancellationToken),
            _ => HelpText
        };
    }

    private async Task<string> HandleDraftCommandAsync(
        TelegramCommand command,
        TelegramIdentity identity,
        string intent,
        CancellationToken cancellationToken)
    {
        var isIncome = intent == TelegramDraftIntent.Income;
        var label = isIncome ? "Ingreso" : "Gasto";
        var syntax = isIncome ? IncomeSyntax : ExpenseSyntax;
        var categoryType = isIncome ? CategoryTypeIncome : CategoryTypeExpense;

        // Campos posicionales separados por ';' (se acepta '|' como compatibilidad). Los segmentos
        // vacíos se tratan como ausentes y la descripción es el último campo, de texto libre.
        var rawArguments = command.Arguments ?? string.Empty;
        var segments = rawArguments.Contains(';')
            ? rawArguments.Split(';', StringSplitOptions.TrimEntries).Select(segment => segment.Trim()).ToList()
            : rawArguments.Split('|', StringSplitOptions.TrimEntries).Select(segment => segment.Trim()).ToList();

        if (segments.Count > ExpenseFieldCount)
        {
            // La descripción es libre: los separadores sobrantes se reincorporan a ese último campo.
            segments[ExpenseFieldCount - 1] = string.Join("; ", segments.Skip(ExpenseFieldCount - 1));
            segments = segments.Take(ExpenseFieldCount).ToList();
        }

        while (segments.Count < ExpenseFieldCount)
        {
            segments.Add(string.Empty);
        }

        if (!TryParseAmount(segments[0], out var amount))
        {
            return $"Indica un monto mayor a cero.\n{syntax}";
        }

        var notes = new List<string>();

        var accounts = await GetExpenseAccountsAsync(identity.UserId, cancellationToken);
        if (accounts.Count == 0)
        {
            return $"No tienes cuentas activas para registrar {label.ToLowerInvariant()}s.";
        }

        var (account, accountError) = ResolveSingleAccount(segments[1], accounts);
        if (account is null)
        {
            return (accountError ?? "No encontré esa cuenta.") + "\n" + syntax;
        }

        AddNote(notes, segments[1], account.Name);

        if (ValidateIncomeAccount(intent, account) is { } incomeBlocked)
        {
            return incomeBlocked;
        }

        var categories = await GetActiveCategoriesAsync(identity.UserId, categoryType, cancellationToken);
        if (isIncome && categories.Count == 0)
        {
            return NoIncomeCategoriesMessage;
        }

        var category = ResolveSingleCategory(segments[2], categories);
        if (category is null)
        {
            return await BuildCategoryFailureAsync(identity, segments[2], categories, isIncome, syntax, cancellationToken);
        }

        AddNote(notes, segments[2], category.Name);

        var subcategories = await GetActiveSubcategoriesAsync(identity.UserId, cancellationToken);
        var (subcategory, subcategoryWarning) = ResolveSingleSubcategory(segments[3], category, subcategories);
        AddNoteOrWarning(notes, segments[3], subcategory?.Name, subcategoryWarning);

        var merchants = await GetActiveMerchantsAsync(identity.UserId, cancellationToken);
        var (merchant, merchantWarning) = ResolveSingleMerchant(segments[4], merchants);
        AddNoteOrWarning(notes, segments[4], merchant?.Name, merchantWarning);

        var draft = await CreateDraftAsync(
            identity,
            amount,
            account,
            Truncate(segments[5], MaxDescriptionLength),
            category,
            subcategory,
            merchant,
            DateTime.UtcNow,
            TelegramDraftSource.Manual,
            intent,
            cancellationToken);

        return DescribeDraft(draft) + FormatNotes(notes);
    }

    /// <summary>
    /// Crea el borrador para una intención <see cref="IntentKind.RegistrarGasto"/> ya extraída.
    /// Los catálogos se reciben resueltos para no volver a consultarlos.
    /// </summary>
    public Task<string> HandleExpenseIntentAsync(
        IntentResult intent,
        TelegramIdentity identity,
        IReadOnlyList<Account> accounts,
        IReadOnlyList<Category> categories,
        IReadOnlyList<Subcategory> subcategories,
        IReadOnlyList<Merchant> merchants,
        CancellationToken cancellationToken)
        => HandleIntentAsync(intent, identity, accounts, categories, subcategories, merchants, TelegramDraftIntent.Expense, cancellationToken);

    /// <summary>
    /// Crea el borrador para una intención <see cref="IntentKind.RegistrarIngreso"/> ya extraída.
    /// Los catálogos se reciben resueltos para no volver a consultarlos.
    /// </summary>
    public Task<string> HandleIncomeIntentAsync(
        IntentResult intent,
        TelegramIdentity identity,
        IReadOnlyList<Account> accounts,
        IReadOnlyList<Category> categories,
        IReadOnlyList<Subcategory> subcategories,
        IReadOnlyList<Merchant> merchants,
        CancellationToken cancellationToken)
        => HandleIntentAsync(intent, identity, accounts, categories, subcategories, merchants, TelegramDraftIntent.Income, cancellationToken);

    private async Task<string> HandleIntentAsync(
        IntentResult intent,
        TelegramIdentity identity,
        IReadOnlyList<Account> accounts,
        IReadOnlyList<Category> categories,
        IReadOnlyList<Subcategory> subcategories,
        IReadOnlyList<Merchant> merchants,
        string draftIntent,
        CancellationToken cancellationToken)
    {
        var isIncome = draftIntent == TelegramDraftIntent.Income;
        var syntax = isIncome ? IncomeSyntax : ExpenseSyntax;

        if (intent.Monto is null || intent.Monto <= 0)
        {
            return "El monto debe ser mayor a cero.";
        }

        var notes = new List<string>();

        var (account, error) = ResolveSingleAccount(intent.Cuenta, accounts);
        if (account is null)
        {
            return error ?? "No encontré esa cuenta. Usa /cuentas para ver los nombres disponibles.";
        }

        AddNote(notes, intent.Cuenta, account.Name);

        if (ValidateIncomeAccount(draftIntent, account) is { } incomeBlocked)
        {
            return incomeBlocked;
        }

        // Categoría obligatoria: sin categoría resuelta no se crea borrador.
        var category = ResolveSingleCategory(intent.Categoria, categories);
        if (category is null)
        {
            return await BuildCategoryFailureAsync(
                identity, intent.Categoria, categories, isIncome, syntax, cancellationToken);
        }

        AddNote(notes, intent.Categoria, category.Name);

        // Subcategoría y comercio son opcionales: si no resuelven, el borrador se crea sin ellos
        // y se avisa al usuario con las opciones disponibles.
        var (subcategory, subcategoryWarning) = ResolveSingleSubcategory(intent.Subcategoria, category, subcategories);
        AddNoteOrWarning(notes, intent.Subcategoria, subcategory?.Name, subcategoryWarning);

        var (merchant, merchantWarning) = ResolveSingleMerchant(intent.Comercio, merchants);
        AddNoteOrWarning(notes, intent.Comercio, merchant?.Name, merchantWarning);

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
                TelegramDraftSource.Ai,
                draftIntent,
                cancellationToken)) + FormatNotes(notes);
    }

    private async Task<string> ConfirmAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var chatId = identity.TelegramChatId;
        var pending = await _drafts.GetPendingAsync(chatId, cancellationToken);

        // La confirmación exige el mismo chat y la misma identidad.
        if (pending is null || pending.TelegramIdentityId != identity.TelegramIdentityId)
        {
            return "No hay ningún borrador pendiente por confirmar.";
        }

        try
        {
            var result = await _drafts.ConfirmAsync(
                pending.DraftId,
                chatId,
                draft => CreateTransactionAsync(draft, identity.UserId, cancellationToken),
                cancellationToken);

            return result.Outcome switch
            {
                TelegramDraftConfirmationOutcome.Confirmed =>
                    $"{(result.Draft!.Intent == TelegramDraftIntent.Income ? "Ingreso" : "Gasto")} registrado:\n" + FormatDraftValues(result.Draft),
                TelegramDraftConfirmationOutcome.Expired =>
                    $"El borrador expiró. Crea uno nuevo con {(pending.Intent == TelegramDraftIntent.Income ? "/ingreso" : "/gasto")}.",
                TelegramDraftConfirmationOutcome.NotPending =>
                    "Ese borrador ya no está pendiente.",
                _ => "No encontré el borrador pendiente."
            };
        }
        catch (ArgumentException exception)
        {
            // Validación de BusinessLogic: mensaje funcional y el borrador permanece pendiente.
            _logger.LogWarning("Telegram transaction confirmation failed: {ErrorType}", exception.GetType().Name);
            return exception.Message;
        }
        catch (Exception exception)
        {
            // La transacción de confirmación ya hizo rollback: el borrador sigue pendiente.
            // Nunca se deja al usuario sin respuesta (p. ej. fallo al resolver el ciclo de una cuenta crédito).
            _logger.LogError("Telegram draft confirmation failed: {ErrorType}", exception.GetType().Name);
            return $"No pude registrar el {(pending.Intent == TelegramDraftIntent.Income ? "ingreso" : "gasto")}. El borrador sigue pendiente: reintenta con /confirmar o cancelar con /cancelar.";
        }
    }

    private Task<Transaction> CreateExpenseAsync(TelegramDraft draft, int userId, CancellationToken cancellationToken)
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

    /// <summary>
    /// Despacha la escritura real según la intención del borrador: ingreso o gasto.
    /// Para ingreso NO se ejecuta la lógica de MSI/crédito de gasto.
    /// </summary>
    private Task<Transaction> CreateTransactionAsync(TelegramDraft draft, int userId, CancellationToken cancellationToken)
        => draft.Intent == TelegramDraftIntent.Income
            ? CreateIncomeAsync(draft, userId, cancellationToken)
            : CreateExpenseAsync(draft, userId, cancellationToken);

    private Task<Transaction> CreateIncomeAsync(TelegramDraft draft, int userId, CancellationToken cancellationToken)
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

        return _transactions.CreateIncomeAsync(transaction, userId);
    }

    private async Task<string> CancelAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var cancelled = await _drafts.CancelAsync(identity.TelegramChatId, cancellationToken);
        return cancelled ? "Borrador cancelado." : "No hay ningún borrador pendiente por cancelar.";
    }

    private async Task<string> DescribePendingAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var pending = await _drafts.GetPendingAsync(identity.TelegramChatId, cancellationToken);
        if (pending is null || pending.TelegramIdentityId != identity.TelegramIdentityId)
        {
            return "No hay ningún borrador pendiente.";
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
        // Se listan ambos tipos, separados, para que /gasto y /ingreso usen el catálogo correcto.
        var expense = await GetActiveCategoriesAsync(identity.UserId, CategoryTypeExpense, cancellationToken);
        var income = await GetActiveCategoriesAsync(identity.UserId, CategoryTypeIncome, cancellationToken);

        if (expense.Count == 0 && income.Count == 0)
        {
            return "No tienes categorías activas.";
        }

        var sections = new List<string>();
        if (expense.Count > 0)
        {
            sections.Add("Gasto:\n" + string.Join('\n', expense.Select(c => $"- {c.Name}")));
        }

        if (income.Count > 0)
        {
            sections.Add("Ingreso:\n" + string.Join('\n', income.Select(c => $"- {c.Name}")));
        }

        return "Categorías disponibles:\n" + string.Join("\n\n", sections);
    }

    private async Task<string> ListSubcategoriesAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var subcategories = await GetActiveSubcategoriesAsync(identity.UserId, cancellationToken);
        if (subcategories.Count == 0)
        {
            return "No tienes subcategorías activas.";
        }

        // El nombre de la categoría puede venir de cualquiera de los dos tipos.
        var categoryNames = (await GetActiveCategoriesAsync(identity.UserId, CategoryTypeExpense, cancellationToken))
            .Concat(await GetActiveCategoriesAsync(identity.UserId, CategoryTypeIncome, cancellationToken))
            .ToDictionary(c => c.CategoryId, c => c.Name);

        var lines = subcategories.Select(s =>
            $"- {s.Name} ({(categoryNames.TryGetValue(s.CategoryId, out var categoryName) ? categoryName : "sin categoría")})");
        return "Subcategorías disponibles:\n" + string.Join('\n', lines);
    }

    private async Task<string> ListMerchantsAsync(TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var merchants = await GetActiveMerchantsAsync(identity.UserId, cancellationToken);
        if (merchants.Count == 0)
        {
            return "No tienes comercios activos.";
        }

        var lines = merchants.Select(m => $"- {m.Name}");
        return "Comercios disponibles:\n" + string.Join('\n', lines);
    }

    private async Task<TelegramDraft> CreateDraftAsync(
        TelegramIdentity identity,
        decimal amount,
        Account account,
        string? description,
        Category? category,
        Subcategory? subcategory,
        Merchant? merchant,
        DateTime transactionDateUtc,
        string source,
        string intent,
        CancellationToken cancellationToken)
    {
        var draft = new TelegramDraft
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
            Intent = intent
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

    /// <summary>
    /// Catálogo activo filtrado por tipo (<c>expense</c>/<c>income</c>): evita ofrecer
    /// categorías de ingreso en el flujo de gasto (y viceversa).
    /// </summary>
    public async Task<IReadOnlyList<Category>> GetActiveCategoriesAsync(int userId, string type, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var categories = await _categories.GetByTypeAsync(userId, type);
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

        var match = CatalogNameMatcher.Match(name, accounts, a => a.Name);
        return match.Value is not null
            ? (match.Value, null)
            : (null, $"No pude identificar la cuenta \"{name.Trim()}\".{FormatOptions(match.Suggestions, a => a.Name, "Usa /cuentas para ver los nombres disponibles.")}");
    }

    private static Category? ResolveSingleCategory(string? name, IReadOnlyList<Category> categories)
    {
        // Categoría obligatoria: ausente se trata como error, no como "sin categoría".
        // El mensaje de fallo lo arma <see cref="BuildCategoryFailureAsync"/> (incluye tipo opuesto).
        if (string.IsNullOrWhiteSpace(name)) return null;

        return CatalogNameMatcher.Match(name, categories, c => c.Name).Value;
    }

    private static (Subcategory? Subcategory, string? Warning) ResolveSingleSubcategory(
        string? name,
        Category category,
        IReadOnlyList<Subcategory> subcategories)
    {
        // Subcategoría opcional: no bloquea el borrador. Siempre se filtra por su categoría.
        if (string.IsNullOrWhiteSpace(name)) return (null, null);

        var candidates = subcategories.Where(s => s.CategoryId == category.CategoryId).ToList();
        var match = CatalogNameMatcher.Match(name, candidates, s => s.Name);
        if (match.Value is not null) return (match.Value, null);

        return (null, $"No encontré la subcategoría \"{name.Trim()}\" en {category.Name}; el borrador se crea sin subcategoría.{FormatOptions(match.Suggestions, s => s.Name, "Usa /subcategorias para ver las disponibles.")}");
    }

    private static (Merchant? Merchant, string? Warning) ResolveSingleMerchant(
        string? name,
        IReadOnlyList<Merchant> merchants)
    {
        // Comercio opcional: no bloquea el borrador.
        if (string.IsNullOrWhiteSpace(name)) return (null, null);

        var match = CatalogNameMatcher.Match(name, merchants, m => m.Name);
        if (match.Value is not null) return (match.Value, null);

        return (null, $"No encontré el comercio \"{name.Trim()}\"; el borrador se crea sin comercio.{FormatOptions(match.Suggestions, m => m.Name, "Usa /comercios para ver los disponibles.")}");
    }

    /// <summary>
    /// Mensaje cuando la categoría obligatoria no resuelve. Antes de responder se prueba el mismo
    /// texto contra las categorías del tipo opuesto para avisar que la intención era la otra.
    /// </summary>
    private async Task<string> BuildCategoryFailureAsync(
        TelegramIdentity identity,
        string? raw,
        IReadOnlyList<Category> currentTypeCategories,
        bool isIncome,
        string syntax,
        CancellationToken cancellationToken)
    {
        var rawName = raw?.Trim() ?? string.Empty;
        if (rawName.Length == 0)
        {
            var missingLabel = isIncome ? "ingreso" : "gasto";
            return $"Falta la categoría del {missingLabel}. Usa /categorias para ver las disponibles.\n{syntax}";
        }

        var match = CatalogNameMatcher.Match(raw, currentTypeCategories, c => c.Name);
        var options = FormatOptions(match.Suggestions, c => c.Name, "Usa /categorias para ver las disponibles.");

        var oppositeType = isIncome ? CategoryTypeExpense : CategoryTypeIncome;
        var opposite = await GetActiveCategoriesAsync(identity.UserId, oppositeType, cancellationToken);
        var oppositeMatch = CatalogNameMatcher.Match(raw, opposite, c => c.Name);
        if (oppositeMatch.Value is not null)
        {
            return isIncome
                ? $"La categoría \"{rawName}\" es de tipo gasto. Usa /gasto para registrarlo, o elige una categoría de ingreso.{options}"
                : $"La categoría \"{rawName}\" es de tipo ingreso. Usa /ingreso para registrarlo, o elige una categoría de gasto.{options}";
        }

        return $"No pude identificar la categoría \"{rawName}\".{options}\n{syntax}";
    }

    /// <summary>Nota de auto-resolución cuando el texto del usuario difiere del nombre canónico.</summary>
    private static void AddNote(List<string> notes, string? raw, string resolvedName)
    {
        if (string.IsNullOrWhiteSpace(raw)) return;
        if (CatalogTextNormalizer.Normalize(raw) == CatalogTextNormalizer.Normalize(resolvedName)) return;

        notes.Add($"Interpreté \"{raw.Trim()}\" como \"{resolvedName}\".");
    }

    /// <summary>Nota de aviso para campos opcionales que no resolvieron, o nota si el texto era aproximado.</summary>
    private static void AddNoteOrWarning(List<string> notes, string? raw, string? resolvedName, string? warning)
    {
        if (resolvedName is not null)
        {
            AddNote(notes, raw, resolvedName);
            return;
        }

        if (warning is not null) notes.Add(warning);
    }

    private static string FormatNotes(List<string> notes)
        => notes.Count == 0 ? string.Empty : "\n\n" + string.Join('\n', notes);

    /// <summary>Alternativas disponibles, o una pista de dónde consultar el catálogo cuando no hay ninguna.</summary>
    private static string FormatOptions<T>(IReadOnlyList<T> items, Func<T, string> nameSelector, string fallbackHint)
        => items.Count == 0
            ? $" {fallbackHint}"
            : $" Opciones: {string.Join(", ", items.Select(nameSelector))}.";

    private static bool TryParseAmount(string? raw, out decimal amount)
    {
        amount = 0m;
        if (string.IsNullOrWhiteSpace(raw)) return false;

        var cleaned = raw.Trim().Replace("$", string.Empty).Replace(" ", string.Empty);
        if (cleaned.Length == 0) return false;

        // Heurística es-MX: "1,5"/"1,50" son decimales; "1.500"/"1,500"/"1,500.00" usan separador de miles.
        var lastDot = cleaned.LastIndexOf('.');
        var lastComma = cleaned.LastIndexOf(',');
        string normalized;

        if (lastDot >= 0 && lastComma >= 0)
        {
            // El último separador que aparece es el decimal; el otro es de miles.
            var decimalSeparator = Math.Max(lastDot, lastComma);
            var integerPart = cleaned[..decimalSeparator].Replace(".", string.Empty).Replace(",", string.Empty);
            var decimalPart = cleaned[(decimalSeparator + 1)..].Replace(".", string.Empty).Replace(",", string.Empty);
            normalized = integerPart + "." + decimalPart;
        }
        else if (lastComma >= 0)
        {
            var commaCount = cleaned.Count(c => c == ',');
            var digitsAfterComma = cleaned.Length - lastComma - 1;
            normalized = commaCount == 1 && digitsAfterComma is 1 or 2
                ? cleaned.Replace(',', '.')
                : cleaned.Replace(",", string.Empty);
        }
        else if (lastDot >= 0)
        {
            var dotCount = cleaned.Count(c => c == '.');
            var digitsAfterDot = cleaned.Length - lastDot - 1;
            normalized = dotCount > 1
                ? cleaned.Replace(".", string.Empty)
                : dotCount == 1 && digitsAfterDot == 3
                    ? cleaned.Replace(".", string.Empty)
                    : cleaned;
        }
        else
        {
            normalized = cleaned;
        }

        if (!decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)) return false;
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

    /// <summary>
    /// Guardia temprana: el flujo de Telegram no captura asignaciones a mensualidades, así que
    /// un ingreso a una cuenta de crédito se rechaza antes de crear el borrador.
    /// Devuelve el mensaje de bloqueo o <c>null</c> si la combinación es válida.
    /// </summary>
    private static string? ValidateIncomeAccount(string intent, Account account)
        => intent == TelegramDraftIntent.Income && account.IsCredit ? CreditIncomeBlockedMessage : null;

    private static string DescribeDraft(TelegramDraft draft) =>
        $"Borrador de {(draft.Intent == TelegramDraftIntent.Income ? "ingreso" : "gasto")}:\n" + FormatDraftValues(draft) + "\nResponde sí para confirmar o no para cancelar.";

    private static string FormatDraftValues(TelegramDraft draft)
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
