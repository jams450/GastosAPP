using System.Text.Json;
using GastosApp.AI.Intent;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;

namespace GastosApp.API.Services.Telegram;

/// <summary>Bounded state for one authorized identity/chat conversation, never a transcript.</summary>
public sealed class TelegramConversationService
{
    public const int MaxMessages = 20;
    public const int MaxInputLength = 2000;
    public const int MaxStateLength = 4096;
    private readonly ITelegramDraftService _drafts;
    private readonly IRepository _repository;
    private readonly TelegramTransactionService _transactions;

    public TelegramConversationService(ITelegramDraftService drafts, IRepository repository, TelegramTransactionService transactions)
    {
        _drafts = drafts;
        _repository = repository;
        _transactions = transactions;
    }

    public Task<TelegramDraft?> PendingAsync(TelegramIdentity identity, CancellationToken ct) =>
        _drafts.GetPendingAsync(identity.TelegramChatId, identity.TelegramIdentityId, ct);

    public static bool CanAcceptMessage(int count) => count < MaxMessages;

    public static IntentResult Merge(IntentResult draft, IntentResult patch) => draft with
    {
        Monto = patch.Monto ?? draft.Monto,
        Cuenta = patch.Cuenta ?? draft.Cuenta,
        Categoria = patch.Categoria ?? draft.Categoria,
        Subcategoria = patch.Subcategoria ?? draft.Subcategoria,
        Comercio = patch.Comercio ?? draft.Comercio,
        Fecha = patch.Fecha ?? draft.Fecha,
        Hora = patch.Hora ?? draft.Hora,
        Descripcion = patch.Descripcion ?? draft.Descripcion,
        PreguntaAclaratoria = null
    };

    public static string? Missing(IntentResult state) => state.Monto is not > 0 ? "monto" :
        string.IsNullOrWhiteSpace(state.Cuenta) ? "cuenta" :
        string.IsNullOrWhiteSpace(state.Categoria) ? "categoría" :
        state.Fecha is null ? "fecha" : string.IsNullOrWhiteSpace(state.Descripcion) ? "descripción" : null;

    public static IntentResult? Read(TelegramDraft? draft)
    {
        if (draft is null) return null;
        if (draft.StructuredState is null)
            return new IntentResult(draft.Intent == TelegramDraftIntent.Income ? IntentKind.RegistrarIngreso : IntentKind.RegistrarGasto,
                draft.Amount, draft.RawAccountName, draft.RawCategoryName, draft.RawSubcategoryName, draft.RawMerchantName,
                draft.TransactionDate is { } date ? DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(date, TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City"))) : null,
                null, draft.Description, null);
        if (draft.StructuredState.Length > MaxStateLength) throw new InvalidOperationException("Invalid conversation state.");
        return JsonSerializer.Deserialize<IntentResult>(draft.StructuredState)
            ?? throw new InvalidOperationException("Invalid conversation state.");
    }

    public static bool Valid(IntentResult state) =>
        state.Monto is null or > 0 and <= 9999999999999.99m &&
        new[] { state.Cuenta, state.Categoria, state.Subcategoria, state.Comercio }.All(v => v is null || v.Length <= 150) &&
        (state.Descripcion is null || state.Descripcion.Length <= 500);

    // Called under the identity row lock by the router, including command turns.
    public async Task<string?> CountAsync(TelegramDraft? pending)
    {
        if (pending is null) return null;
        if (pending.ExpiresAt <= DateTime.UtcNow)
        {
            pending.Status = TelegramDraftStatus.Expired;
            await _repository.SaveUpdate(pending.DraftId, pending);
            return "El borrador expiró. Inicia un nuevo movimiento.";
        }
        if (!CanAcceptMessage(pending.MessageCount))
        {
            pending.Status = TelegramDraftStatus.Expired;
            await _repository.SaveUpdate(pending.DraftId, pending);
            return "La conversación alcanzó el límite de 20 mensajes y expiró. Inicia un nuevo movimiento.";
        }
        pending.MessageCount++;
        await _repository.SaveUpdate(pending.DraftId, pending);
        return null;
    }

    public async Task<string> ApplyAsync(IntentResult patch, TelegramIdentity identity, TelegramDraft? pending, CancellationToken ct)
    {
        var previous = Read(pending);
        if (previous is not null && (patch.Kind != previous.Kind || patch.PreguntaAclaratoria is not null || patch.NewMovement))
            return "No cambié el borrador. Aclara la corrección o usa /cancelar antes de iniciar otro movimiento.";
        if (patch.Kind is not (IntentKind.RegistrarGasto or IntentKind.RegistrarIngreso))
            return "¿Quieres registrar un gasto o un ingreso?";
        var state = previous is null ? patch : Merge(previous, patch);
        if (!Valid(state)) return "Los datos exceden los límites o el monto no es válido. Corrige el mensaje.";
        var json = JsonSerializer.Serialize(state);
        if (json.Length > MaxStateLength) return "El borrador excede el límite permitido. Reduce la descripción.";
        var draft = pending ?? new TelegramDraft
        {
            TelegramIdentityId = identity.TelegramIdentityId,
            ChatId = identity.TelegramChatId,
            Source = TelegramDraftSource.Ai,
            MessageCount = 1
        };
        draft.Intent = state.Kind == IntentKind.RegistrarIngreso ? TelegramDraftIntent.Income : TelegramDraftIntent.Expense;
        draft.StructuredState = json;
        draft.Amount = state.Monto;
        draft.SummaryReady = false;
        if (pending is null) await _drafts.CreateAsync(draft, ct);
        else await _repository.SaveUpdate(draft.DraftId, draft);
        if (Missing(state) is { } field) return $"¿Qué {field} corresponde al movimiento?";

        // Reuse existing catalog resolution and ownership/invariant validation.
        var accounts = await _transactions.GetExpenseAccountsAsync(identity.UserId, ct);
        var categories = await _transactions.GetActiveCategoriesAsync(identity.UserId,
            draft.Intent == TelegramDraftIntent.Income ? "income" : "expense", ct);
        var subs = await _transactions.GetActiveSubcategoriesAsync(identity.UserId, ct);
        var merchants = await _transactions.GetActiveMerchantsAsync(identity.UserId, ct);
        var response = draft.Intent == TelegramDraftIntent.Income
            ? await _transactions.HandleIncomeIntentAsync(state, identity, accounts, categories, subs, merchants, ct)
            : await _transactions.HandleExpenseIntentAsync(state, identity, accounts, categories, subs, merchants, ct);
        var resolved = await PendingAsync(identity, ct);
        if (resolved is not null && resolved.DraftId != draft.DraftId)
        {
            resolved.StructuredState = json;
            resolved.MessageCount = draft.MessageCount;
            resolved.ExpiresAt = draft.ExpiresAt;
            resolved.SummaryReady = true;
            await _repository.SaveUpdate(resolved.DraftId, resolved);
        }
        return response;
    }
}
