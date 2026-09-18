using GastosApp.AI.Configuration;
using GastosApp.AI.Intent;
using GastosApp.API.Extensions;
using GastosApp.Models.Entities;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Telegram;

/// <summary>
/// Orquestador del mensaje entrante. Resuelve primero comandos y atajos deterministas
/// (<see cref="TelegramCommandParser"/>, sin IA), y solo para texto libre llama a
/// <see cref="IExpenseIntentExtractor"/> para enrutar por intención:
/// <see cref="IntentKind.RegistrarGasto"/> y <see cref="IntentKind.RegistrarIngreso"/> →
/// <see cref="TelegramTransactionService"/> (borrador),
/// <see cref="IntentKind.Consulta"/> → <see cref="TelegramQueryService"/> (solo lectura),
/// desconocido → pregunta aclaratoria.
/// </summary>
public sealed class TelegramMessageRouter
{
    private const string MexicoTimeZoneId = "America/Mexico_City";
    private const int MaxCatalogNames = 50;

    private const string GenericMessage =
        "No pude interpretar el mensaje. Puedes usar /gasto <monto>; <cuenta>; <categoría> o /ingreso <monto>; <cuenta>; <categoría>, o pedir un resumen de tus finanzas.";

    private readonly TelegramTransactionService _expenses;
    private readonly TelegramQueryService _queries;
    private readonly IExpenseIntentExtractor _extractor;
    private readonly IOptions<LlmOptions> _llm;
    private readonly ILogger<TelegramMessageRouter> _logger;

    public TelegramMessageRouter(
        TelegramTransactionService expenses,
        TelegramQueryService queries,
        IExpenseIntentExtractor extractor,
        IOptions<LlmOptions> llm,
        ILogger<TelegramMessageRouter> logger)
    {
        _expenses = expenses;
        _queries = queries;
        _extractor = extractor;
        _llm = llm;
        _logger = logger;
    }

    public Task<string> RouteAsync(string text, TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var command = TelegramCommandParser.Parse(text);
        return command.Kind == TelegramCommandKind.None
            ? HandleFreeTextAsync(text, identity, cancellationToken)
            : _expenses.ExecuteCommandAsync(command, identity, cancellationToken);
    }

    private async Task<string> HandleFreeTextAsync(string text, TelegramIdentity identity, CancellationToken cancellationToken)
    {
        // Sin configuración LLM usable: comandos manuales siguen funcionando y el texto libre responde genérico.
        if (!TelegramConfigurationExtensions.IsLlmUsable(_llm.Value))
        {
            return GenericMessage;
        }

        try
        {
            var accounts = await _expenses.GetExpenseAccountsAsync(identity.UserId, cancellationToken);
            var categories = await _expenses.GetActiveCategoriesAsync(identity.UserId, "expense", cancellationToken);
            var incomeCategories = await _expenses.GetActiveCategoriesAsync(identity.UserId, "income", cancellationToken);
            var subcategories = await _expenses.GetActiveSubcategoriesAsync(identity.UserId, cancellationToken);
            var merchants = await _expenses.GetActiveMerchantsAsync(identity.UserId, cancellationToken);

            var request = new IntentRequest(
                text,
                DateTimeOffset.UtcNow,
                MexicoTimeZoneId,
                accounts.Select(a => a.Name).Take(MaxCatalogNames).ToList(),
                categories.Select(c => c.Name).Take(MaxCatalogNames).ToList(),
                incomeCategories.Select(c => c.Name).Take(MaxCatalogNames).ToList(),
                subcategories.Select(s => s.Name).Take(MaxCatalogNames).ToList(),
                merchants.Select(m => m.Name).Take(MaxCatalogNames).ToList());

            var intent = await _extractor.ExtractAsync(request, cancellationToken);

            switch (intent.Kind)
            {
                case IntentKind.RegistrarGasto:
                    return await _expenses.HandleExpenseIntentAsync(
                        intent, identity, accounts, categories, subcategories, merchants, cancellationToken);

                case IntentKind.RegistrarIngreso:
                    return await _expenses.HandleIncomeIntentAsync(
                        intent, identity, accounts, incomeCategories, subcategories, merchants, cancellationToken);

                case IntentKind.Consulta:
                    return await _queries.ConsultaAsync(text, identity, cancellationToken);

                default:
                    return string.IsNullOrWhiteSpace(intent.PreguntaAclaratoria) ? GenericMessage : intent.PreguntaAclaratoria;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            // Nunca se loguea el cuerpo del mensaje ni el prompt: solo el tipo de error.
            _logger.LogWarning("Telegram free text handling failed: {ErrorType}", exception.GetType().Name);
            return GenericMessage;
        }
    }
}
