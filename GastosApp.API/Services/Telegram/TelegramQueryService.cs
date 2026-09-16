using GastosApp.Models.Entities;

namespace GastosApp.API.Services.Telegram;

/// <summary>
/// Consultas de solo lectura en lenguaje natural (intención <c>Consulta</c>).
/// Envuelve <see cref="ExpenseAgentService"/>; no escribe nada. Los errores se propagan
/// al orquestador (<see cref="TelegramMessageRouter"/>), que responde el mensaje genérico.
/// </summary>
public sealed class TelegramQueryService
{
    private const string GenericMessage =
        "No pude interpretar el mensaje. Puedes usar /gasto <monto> <cuenta> o pedir un resumen de tus gastos.";

    private readonly ExpenseAgentService _agent;

    public TelegramQueryService(ExpenseAgentService agent)
    {
        _agent = agent;
    }

    // userId explícito: proviene de la identidad persistida, nunca del LLM.
    public async Task<string> ConsultaAsync(string text, TelegramIdentity identity, CancellationToken cancellationToken)
    {
        var reply = await _agent.RespondAsync(text, identity.UserId, cancellationToken);
        return string.IsNullOrWhiteSpace(reply) ? GenericMessage : reply;
    }
}
