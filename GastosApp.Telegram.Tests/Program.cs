using System.Reflection;
using GastosApp.AI.Intent;
using GastosApp.API.Services.Telegram;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Services.Catalog;
using GastosApp.Models.Entities;
using Microsoft.Extensions.Logging.Abstractions;

await TelegramFinancialQueryTests.RunAsync();
await TelegramBudgetQueryTests.RunAsync();
await TelegramAlertQueryTests.RunAsync();

var checks = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new Exception(name);
    checks++;
}
var catalogAccounts = new[]
{
    new Account { AccountId = 1, Name = "Cuenta principal ahorro" },
    new Account { AccountId = 2, Name = "Cuenta principal" }
};
foreach (var (input, expected) in new[]
{
    ("Cuenta principal", catalogAccounts[1]),
    ("Cuenta principal ahorro", catalogAccounts[0]),
    ("  CUÉNTA\t PRINCIPÁL  ", catalogAccounts[1])
})
{
    var match = CatalogNameMatcher.Match(input, catalogAccounts, account => account.Name);
    Check(ReferenceEquals(match.Value, expected) && match.Score == 1.0 && match.Suggestions.Count == 0,
        $"Unique normalized exact account resolves: {input}");
}
var duplicateAccounts = new[]
{
    new Account { AccountId = 3, Name = "  CUÉNTA  PRINCIPÁL " },
    catalogAccounts[0],
    catalogAccounts[1]
};
var duplicateMatch = CatalogNameMatcher.Match("Cuenta principal", duplicateAccounts, account => account.Name);
Check(duplicateMatch.Value is null && duplicateMatch.Score == 1.0 &&
    duplicateMatch.Suggestions.SequenceEqual(new[] { duplicateAccounts[0], catalogAccounts[1], catalogAccounts[0] }),
    "Duplicate normalized exact accounts remain ambiguous with ranked suggestions");
var fuzzyMatch = CatalogNameMatcher.Match("Cuenta prin", catalogAccounts, account => account.Name);
Check(fuzzyMatch.Value is null && fuzzyMatch.Score == 0.92 &&
    fuzzyMatch.Suggestions.SequenceEqual(new[] { catalogAccounts[1], catalogAccounts[0] }),
    "Fuzzy prefix tie remains ambiguous with name-ordered suggestions");
var fuzzyUniqueMatch = CatalogNameMatcher.Match("Cuenta principa", new[] { catalogAccounts[1] }, account => account.Name);
Check(ReferenceEquals(fuzzyUniqueMatch.Value, catalogAccounts[1]) && fuzzyUniqueMatch.Score == 0.92,
    "Unique confident fuzzy account still resolves");
var weakMatch = CatalogNameMatcher.Match("xyz", catalogAccounts, account => account.Name);
Check(weakMatch.Value is null && weakMatch.Score < CatalogNameMatcher.AutoMatchThreshold,
    "Low-confidence account remains unresolved");
IntentResult State(IntentKind kind = IntentKind.RegistrarGasto) => new(kind, null, null, null, null, null, null, null, null, null);
var store = new DraftStore();
var repository = Stub<IRepository>.Create((m, a) => m.Name switch
{
    "SaveUpdate" => Task.FromResult((TelegramDraft)a![1]!),
    "LockTelegramIdentityAsync" => Task.CompletedTask,
    "ExecuteInTransactionAsync" => ((Func<Task<string>>)a![0]!)(),
    _ => throw new NotSupportedException(m.Name)
});
var accounts = Stub<IAccountService>.Create((m, a) => m.Name == "GetAllActiveByUserIdAsync"
    ? Task.FromResult<IEnumerable<Account>>([new Account { AccountId = 1, UserId = (int)a![0]!, Name = "efectivo", Active = true }]) : throw new NotSupportedException(m.Name));
var categories = Stub<ICategoryService>.Create((m, a) => m.Name == "GetByTypeAsync"
    ? Task.FromResult<IEnumerable<Category>>([new Category { CategoryId = 2, UserId = (int)a![0]!, Name = (string)a[1]! == "income" ? "salario" : "comida", Type = (string)a[1]!, Active = true }]) : throw new NotSupportedException(m.Name));
var subs = Stub<ISubcategoryService>.Create((m, a) => Task.FromResult<IEnumerable<Subcategory>>([]));
var merchants = Stub<IMerchantService>.Create((m, a) => Task.FromResult<IEnumerable<Merchant>>([]));
var transactionWrites = 0;
var fail = false;
var transactions = Stub<ITransactionService>.Create((m, a) =>
{
    if (fail) throw new InvalidOperationException("Injected commit failure");
    transactionWrites++;
    var transaction = (Transaction)a![0]!;
    transaction.TransactionId = transactionWrites;
    return Task.FromResult(transaction);
});
var service = new TelegramTransactionService(store, transactions, accounts, categories, subs, merchants, NullLogger<TelegramTransactionService>.Instance);
var conversation = new TelegramConversationService(store, repository, service);
var identity = new TelegramIdentity { TelegramIdentityId = 1, UserId = 1, TelegramChatId = 100, TelegramUserId = 100, Active = true };
var ct = CancellationToken.None;
async Task<string> Turn(IntentResult patch, TelegramIdentity? who = null)
{
    who ??= identity;
    var pending = await conversation.PendingAsync(who, ct);
    var limit = await conversation.CountAsync(pending);
    return limit ?? await conversation.ApplyAsync(patch, who, pending, ct);
}
async Task<string> Command(string text)
{
    var pending = await conversation.PendingAsync(identity, ct);
    var limit = await conversation.CountAsync(pending);
    return limit ?? await service.ExecuteCommandAsync(TelegramCommandParser.Parse(text), identity, ct);
}

foreach (var kind in new[] { IntentKind.RegistrarIngreso, IntentKind.RegistrarGasto })
{
    var first = await Turn(State(kind) with { Monto = 500 });
    Check(first.Contains("cuenta"), "Incomplete intent prompts account");
    var complete = State(kind) with { Cuenta = "efectivo", Categoria = kind == IntentKind.RegistrarIngreso ? "salario" : "comida", Fecha = DateOnly.FromDateTime(DateTime.UtcNow), Descripcion = "test" };
    var summary = await Turn(complete);
    Check(summary.Contains("confirmar"), "Two-turn complete summary");
    var pending = (await conversation.PendingAsync(identity, ct))!;
    Check(pending.Amount == 500 && pending.SummaryReady && pending.MessageCount == 2, "Partial state merged and durable");
    var ambiguous = await Turn(State(kind) with { Monto = 900, NewMovement = true });
    Check(ambiguous.Contains("No cambié") && pending.Amount == 500, "New movement cannot overwrite");
    var corrected = await Turn(State(kind) with { Monto = 600, Descripcion = "corrected" });
    pending = (await conversation.PendingAsync(identity, ct))!;
    Check(corrected.Contains("600") && pending.SummaryReady, "Correction produces new summary");
    var writesBefore = transactionWrites;
    var saved = await Command("/confirmar");
    Check(saved.Contains("registrado") && transactionWrites == writesBefore + 1, "Explicit save succeeds");
    await Command("/confirmar");
    Check(transactionWrites == writesBefore + 1, "Duplicate confirmation cannot write");
    Check(await conversation.PendingAsync(identity, ct) is null, "Successful context closed");
}
await Turn(State() with { Monto = 20 });
var other = new TelegramIdentity { TelegramIdentityId = 2, UserId = 2, TelegramChatId = 100 };
Check(await conversation.PendingAsync(other, ct) is null, "Same chat isolates user");
var anotherChat = new TelegramIdentity { TelegramIdentityId = 1, UserId = 1, TelegramChatId = 101 };
Check(await conversation.PendingAsync(anotherChat, ct) is null, "Same identity isolates chat");
Check((await Command("/confirmar")).Contains("Completa"), "Incomplete cannot confirm");
Check((await Command("/cancelar")).Contains("cancelado"), "Cancellation closes partial");
Check(await conversation.PendingAsync(identity, ct) is null, "Cancelled context closed");
await Turn(State() with { Monto = 30, Cuenta = "efectivo", Categoria = "comida", Fecha = DateOnly.FromDateTime(DateTime.UtcNow), Descripcion = "limit" });
var boundary = (await conversation.PendingAsync(identity, ct))!;
boundary.MessageCount = 19;
Check((await Command("/confirmar")).Contains("registrado"), "Message twenty confirmation succeeds");
await Turn(State() with { Monto = 30, Cuenta = "efectivo", Categoria = "comida", Fecha = DateOnly.FromDateTime(DateTime.UtcNow), Descripcion = "limit" });
boundary = (await conversation.PendingAsync(identity, ct))!;
boundary.MessageCount = 20;
var beforeLimit = transactionWrites;
Check((await Command("/confirmar")).Contains("expiró") && transactionWrites == beforeLimit, "Message twenty-one expires without write");
await Turn(State() with { Monto = 30 });
var expired = (await conversation.PendingAsync(identity, ct))!;
expired.ExpiresAt = DateTime.UtcNow.AddSeconds(-1);
Check((await Command("/confirmar")).Contains("expiró") && transactionWrites == beforeLimit, "Expired cannot save");
await Turn(State() with { Monto = 30, Cuenta = "efectivo", Categoria = "comida", Fecha = DateOnly.FromDateTime(DateTime.UtcNow), Descripcion = "failure" });
fail = true;
Check((await Command("/confirmar")).Contains("sigue pendiente"), "Commit failure never claims success");
Check(await conversation.PendingAsync(identity, ct) is not null, "Failure preserves draft");
fail = false;
await Command("/cancelar");
Check(!TelegramConversationService.Valid(State() with { Descripcion = new string('x', 501) }), "Oversized model field rejected");
Check(!TelegramConversationService.Valid(State() with { Monto = -2 }), "Negative model amount rejected");
Check(TelegramConversationService.Missing(State() with { Monto = 10, Cuenta = "efectivo", Categoria = "comida" }) == "fecha", "No blind date default");
Check(!TelegramConversationService.CanAcceptMessage(20) && TelegramConversationService.CanAcceptMessage(19), "Limit boundary");
try
{
    TelegramConversationService.Read(new TelegramDraft { StructuredState = "not JSON" });
    throw new Exception("Malformed state accepted");
}
catch (System.Text.Json.JsonException) { checks++; }
var validate = typeof(ExpenseIntentExtractor).GetMethod("Validate", BindingFlags.NonPublic | BindingFlags.Static)!;
Check(((IntentResult)validate.Invoke(null, [State()])!).Kind == IntentKind.RegistrarGasto, "Extractor preserves incomplete expense intent");
Check(((IntentResult)validate.Invoke(null, [State(IntentKind.RegistrarIngreso)])!).Kind == IntentKind.RegistrarIngreso, "Extractor preserves incomplete income intent");
try
{
    TelegramConversationService.Read(new TelegramDraft { StructuredState = new string('x', 4097) });
    throw new Exception("Oversized state accepted");
}
catch (InvalidOperationException) { checks++; }
await Turn(State() with { Monto = 12 });
var ambiguousPending = (await conversation.PendingAsync(identity, ct))!;
await Turn(State(IntentKind.RegistrarIngreso) with { Monto = 999 });
Check(ambiguousPending.Amount == 12 && ambiguousPending.Intent == TelegramDraftIntent.Expense, "Intent switch cannot silently overwrite");
await Command("/cancelar");
// Exercise the production router/parser/transaction command path, not a source assertion.
var extractor = Stub<IExpenseIntentExtractor>.Create((m, a) => throw new Exception("Confirmation must not invoke the model"));
var router = new TelegramMessageRouter(service, conversation, repository, null!, extractor,
    Microsoft.Extensions.Options.Options.Create(new GastosApp.AI.Configuration.LlmOptions()), NullLogger<TelegramMessageRouter>.Instance);
await Turn(State() with { Monto = 100, Cuenta = "efectivo", Categoria = "comida", Fecha = DateOnly.FromDateTime(DateTime.UtcNow), Descripcion = "confirmation regression" });
var beforeMixedConfirmation = transactionWrites;
var rejected = await router.RouteAsync("/confirmar cambia el monto a 200", identity, ct);
Check(transactionWrites == beforeMixedConfirmation, "Mixed confirmation/correction must not save old amount");
Check(rejected.Contains("por separado"), "Mixed confirmation explains standalone confirmation or correction");
var stillPending = (await conversation.PendingAsync(identity, ct))!;
Check(stillPending.Amount == 100 && stillPending.SummaryReady, "Rejected confirmation preserves latest draft");
Check((await router.RouteAsync("/confirmar", identity, ct)).Contains("registrado") && transactionWrites == beforeMixedConfirmation + 1,
    "Standalone slash confirmation retains production route behavior");
await Turn(State() with { Monto = 100, Cuenta = "efectivo", Categoria = "comida", Fecha = DateOnly.FromDateTime(DateTime.UtcNow), Descripcion = "affirmative regression" });
Check((await router.RouteAsync("sí", identity, ct)).Contains("registrado") && transactionWrites == beforeMixedConfirmation + 2,
    "Standalone natural affirmative retains production route behavior");

// Read-only source assertions are supplementary, not database concurrency tests.
var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
var upgrade = File.ReadAllText(Path.Combine(root, "SQL/telegram_conversation_state.sql"));
var bootstrap = File.ReadAllText(Path.Combine(root, "SQL/schema.sql"));
var mapping = File.ReadAllText(Path.Combine(root, "GastosApp.BusinessLogic/Context/ContextSqlGastos.cs"));
Check(upgrade.Contains("telegram_identity_id, chat_id") && bootstrap.Contains("telegram_identity_id, chat_id") && mapping.Contains("new { e.TelegramIdentityId, e.ChatId }"), "Pending index SQL/EF alignment");
var updateSource = File.ReadAllText(Path.Combine(root, "GastosApp.API/Services/Telegram/TelegramUpdateService.cs"));
Check(updateSource.Contains("LockTelegramProcessedUpdateAsync") && updateSource.Contains("owned?.ClaimToken != claimToken") && updateSource.Contains("MarkDoneAsync"), "Update fencing and completion route present");
var repositorySource = File.ReadAllText(Path.Combine(root, "GastosApp.BusinessLogic/Services/Infrastructure/Repository.cs"));
Check(repositorySource.Contains("RollbackToSavepointAsync") && repositorySource.Contains("ChangeTracker.Clear()"), "Confirmation rollback savepoint present");
Console.WriteLine($"PASS {checks} deterministic conversation outcomes (offline fake persistence; not PostgreSQL proof)");

public class Stub<T> : DispatchProxy where T : class
{
    public Func<MethodInfo, object?[]?, object?> Handler = null!;
    public static T Create(Func<MethodInfo, object?[]?, object?> handler)
    {
        var proxy = DispatchProxy.Create<T, Stub<T>>();
        ((Stub<T>)(object)proxy).Handler = handler;
        return proxy;
    }
    protected override object? Invoke(MethodInfo? method, object?[]? args) => Handler(method!, args);
}

public sealed class DraftStore : ITelegramDraftService
{
    public List<TelegramDraft> Rows { get; } = [];
    public Task<TelegramDraft> CreateAsync(TelegramDraft draft, CancellationToken ct = default)
    {
        foreach (var old in Rows.Where(d => d.TelegramIdentityId == draft.TelegramIdentityId && d.ChatId == draft.ChatId && d.Status == TelegramDraftStatus.Pending)) old.Status = TelegramDraftStatus.Cancelled;
        draft.Status = TelegramDraftStatus.Pending;
        draft.ExpiresAt = DateTime.UtcNow.AddMinutes(15);
        Rows.Add(draft);
        return Task.FromResult(draft);
    }
    public Task<TelegramDraft?> GetAsync(Guid id, CancellationToken ct = default) => Task.FromResult(Rows.FirstOrDefault(d => d.DraftId == id));
    public Task<TelegramDraft?> GetPendingAsync(long chat, int identity, CancellationToken ct = default) => Task.FromResult(Rows.LastOrDefault(d => d.ChatId == chat && d.TelegramIdentityId == identity && d.Status == TelegramDraftStatus.Pending));
    public async Task<bool> CancelAsync(long chat, int identity, CancellationToken ct = default)
    {
        var draft = await GetPendingAsync(chat, identity, ct);
        if (draft is null) return false;
        draft.Status = TelegramDraftStatus.Cancelled;
        return true;
    }
    public Task<int> ExpireStaleAsync(DateTime now, CancellationToken ct = default) => throw new NotSupportedException();
    public Task<int> PurgeAsync(DateTime before, CancellationToken ct = default) => throw new NotSupportedException();
    public async Task<TelegramDraftConfirmationResult> ConfirmAsync(Guid id, long chat, Func<TelegramDraft, Task<Transaction>> create, CancellationToken ct = default)
    {
        var draft = (await GetAsync(id, ct))!;
        if (draft.Status != TelegramDraftStatus.Pending) return new(TelegramDraftConfirmationOutcome.NotPending, draft, null);
        var transaction = await create(draft);
        draft.TransactionId = transaction.TransactionId;
        draft.Status = TelegramDraftStatus.Confirmed;
        return new(TelegramDraftConfirmationOutcome.Confirmed, draft, transaction);
    }
}
