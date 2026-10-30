using GastosApp.AI.Email;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Email;
using GastosApp.Models.Entities;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Email;

/// <summary>
/// Motivos estables de una revisión pedida por el respaldo LLM. Se devuelven al cliente y se traducen
/// en la pantalla; nunca contienen datos del correo, del proveedor ni del modelo.
/// <para>
/// Son cuatro y no siete a propósito: el motivo del componente (<c>provider_unavailable</c>,
/// <c>response_invalid</c>, <c>uncertain</c>…) describe por qué el modelo no eligió, pero para el
/// usuario la consecuencia es la misma —revisión—. La distinción que sí importa es la que explica
/// QUÉ hacer: configurar el proveedor, subir el presupuesto, arreglar el catálogo o revisar el correo.
/// </para>
/// </summary>
public static class EmailLlmReviewReason
{
    /// <summary>No hay proveedor configurado, la llamada falló o la respuesta no cumplió el contrato.</summary>
    public const string Unavailable = "llm_unavailable";

    /// <summary>La corrida ya gastó su presupuesto de llamadas; no se invocó al modelo.</summary>
    public const string BudgetExhausted = "llm_budget_exhausted";

    /// <summary>El catálogo activo no es utilizable (vacío, más de 200 etiquetas o ids repetidos).</summary>
    public const string CatalogInvalid = "llm_catalog_invalid";

    /// <summary>El modelo dudó, devolvió un id fuera del catálogo o una respuesta inválida.</summary>
    public const string Uncertain = "llm_uncertain";
}

/// <summary>
/// Orquestación del respaldo LLM del clasificador de correo (S15) en la capa API.
/// <para>
/// <b>No decora</b> <see cref="IEmailClassificationService"/>: envolverlo globalmente haría que el
/// motor determinista se llamara a sí mismo —y que las pruebas del motor dependieran de un modelo—.
/// Se inyecta explícitamente en los dos llamadores que sí pueden gastar presupuesto (la vista previa
/// y el pase diario) y expone <see cref="ClassifyAsync"/> con el presupuesto de la corrida.
/// </para>
/// <para>
/// Reglas que sostienen el diseño:
/// <list type="bullet">
/// <item>El determinista corre SIEMPRE primero. Solo se ramifica cuando su resultado es
/// <c>llm_requested</c>, que es la acción terminal <c>llm</c> de una regla. <c>rule_review</c>,
/// <c>too_old</c> y una etiqueta asignada son terminales y no tocan el modelo.</item>
/// <item>El respaldo de <c>no_match</c> existe pero está apagado por defecto:
/// <c>Email:LlmFallbackEnabled</c> es una decisión de costo explícita y no cambia el hecho de que
/// una regla que pide el LLM funcione con el respaldo apagado.</item>
/// <item>Toda falla termina en revisión conservando la regla y el motivo determinista que la pidió,
/// nunca en la etiqueta de una regla posterior ni re-ejecutando el motor.</item>
/// <item>El catálogo son todas las etiquetas activas del dueño, incluidas las de descarte
/// («Eliminar»), con id, nombre y descripción. Más de 200 falla cerrado: truncar escondería
/// etiquetas válidas del usuario.</item>
/// <item>Un intento consume presupuesto antes de llamar, incluso si la llamada falla. Sin eso, un
/// proveedor caído gastaría una llamada por mensaje del buzón.</item>
/// <item>Nada del correo va al log: solo el tipo de excepción, igual que el componente.</item>
/// </list>
/// Comparte el mismo <c>ILlmChatClientProvider</c> (y por lo tanto proveedor, modelo y configuración)
/// que Telegram, sin usar su transporte.
/// </para>
/// </summary>
public sealed class EmailLlmClassificationService
{
    /// <summary>
    /// Motivo que emite la capa determinista para una regla con acción <c>llm</c>. Es el único
    /// resultado que autoriza llamar al modelo.
    /// </summary>
    private const string LlmRequestedReason = "llm_requested";

    /// <summary>Motivo de la capa determinista cuando ninguna regla casó (el respaldo opcional).</summary>
    private const string NoMatchReason = "no_match";

    private readonly IEmailClassificationService _deterministic;
    private readonly IEmailLlmClassifier _classifier;
    private readonly IEmailLabelService _labels;
    private readonly EmailClassifierOptions _options;
    private readonly ILogger<EmailLlmClassificationService> _logger;

    public EmailLlmClassificationService(
        IEmailClassificationService deterministic,
        IEmailLlmClassifier classifier,
        IEmailLabelService labels,
        IOptions<EmailClassifierOptions> options,
        ILogger<EmailLlmClassificationService> logger)
    {
        _deterministic = deterministic;
        _classifier = classifier;
        _labels = labels;
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>
    /// Presupuesto de una corrida con el tope configurado (<c>Email:LlmMaxPerRun</c>, 20 por defecto,
    /// acotado a 0..200). Lo construye el llamador UNA sola vez por corrida.
    /// </summary>
    public EmailClassificationRunBudget CreateRunBudget() => new(_options.LlmMaxPerRun);

    /// <summary>
    /// Clasifica un correo: motor determinista primero y, solo si la regla pidió el LLM (o el
    /// respaldo de <c>no_match</c> está encendido), el modelo. Nunca lanza por datos, configuración ni
    /// fallos del modelo; solo propaga la cancelación del llamador.
    /// </summary>
    public async Task<EmailClassificationResult> ClassifyAsync(
        int userId,
        EmailMessageCandidate candidate,
        EmailClassificationRunBudget budget,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(candidate);
        ArgumentNullException.ThrowIfNull(budget);

        // Sin esto, encender el respaldo convertiría al LLM en la ruta principal. El determinista ya
        // resolvió el caso terminal (etiqueta, revisión explícita, corte de antigüedad).
        var deterministic = await _deterministic.ClassifyAsync(userId, candidate, cancellationToken);

        if (!RequestsModel(deterministic))
        {
            return deterministic;
        }

        // Con el presupuesto agotado no se lee siquiera el catálogo: esta corrida ya no puede llamar al
        // modelo, y una consulta a la base para preparar una llamada imposible no aporta nada. Es una
        // lectura del tope, no una reserva: el lugar se reserva justo antes de llamar.
        if (budget.Remaining <= 0)
        {
            return Review(deterministic, EmailLlmReviewReason.BudgetExhausted);
        }

        // El catálogo se valida antes de gastar un lugar del presupuesto: un catálogo inutilizable no
        // puede producir una elección confiable y no debería consumir la corrida.
        var catalog = await LoadCatalogAsync(userId, cancellationToken);
        if (catalog is null)
        {
            return Review(deterministic, EmailLlmReviewReason.CatalogInvalid);
        }

        // Reserva atómica: dos mensajes concurrentes no pueden gastar el mismo lugar. Si otro mensaje
        // se llevó el último entre la lectura de arriba y esta línea, también termina en revisión.
        if (!budget.TryReserve())
        {
            return Review(deterministic, EmailLlmReviewReason.BudgetExhausted);
        }

        EmailLlmDecision decision;
        try
        {
            decision = await _classifier.ClassifyAsync(
                new EmailLlmRequest(
                    candidate.SenderAddress,
                    candidate.Subject,
                    candidate.BodyText,
                    catalog.Labels),
                cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // La cancelación del llamador no es un fallo del clasificador: se propaga intacta, aunque
            // el intento ya haya consumido su lugar del presupuesto.
            throw;
        }
        catch (Exception exception)
        {
            // Defensa del orquestador: el contrato del componente dice que no lanza, pero una
            // excepción inesperada no puede tumbar la clasificación de toda la muestra.
            _logger.LogWarning(
                "Email LLM classification failed in the API orchestrator: {ErrorType}",
                exception.GetType().Name);
            return Review(deterministic, EmailLlmReviewReason.Unavailable);
        }

        if (decision is null || decision.LabelId is not int labelId)
        {
            return Review(deterministic, MapReason(decision?.Reason));
        }

        // Solo ids del catálogo activo que viajó al modelo: nada fabricado llega al motor.
        if (!catalog.ById.TryGetValue(labelId, out var label))
        {
            return Review(deterministic, EmailLlmReviewReason.Uncertain);
        }

        // El veredicto del modelo es terminal: conserva la regla que lo pidió para que la cola de
        // revisión y el detalle puedan mostrarla, pero el resto del resultado sale de la etiqueta real.
        return EmailClassificationResult.FromLabel(label, EmailLlmReasons.Model) with
        {
            MatchedRuleId = deterministic.MatchedRuleId,
            MatchedRuleName = deterministic.MatchedRuleName
        };
    }

    /// <summary>
    /// Despacha al orquestador cuando está cableado y al determinista cuando no. Existe para que los
    /// llamadores conserven su constructor anterior (pruebas incluidas) sin que la producción pueda
    /// quedarse sin el respaldo: el contenedor siempre inyecta el orquestador.
    /// </summary>
    public static Task<EmailClassificationResult> DispatchAsync(
        EmailLlmClassificationService? llm,
        IEmailClassificationService deterministic,
        int userId,
        EmailMessageCandidate candidate,
        EmailClassificationRunBudget budget,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(deterministic);
        ArgumentNullException.ThrowIfNull(budget);

        return llm is null
            ? deterministic.ClassifyAsync(userId, candidate, cancellationToken)
            : llm.ClassifyAsync(userId, candidate, budget, cancellationToken);
    }

    private bool RequestsModel(EmailClassificationResult deterministic)
    {
        if (string.Equals(deterministic.Reason, LlmRequestedReason, StringComparison.Ordinal))
        {
            // La regla pidió el modelo para ESTE correo. El respaldo de no_match no tiene que ver.
            return true;
        }

        return _options.LlmFallbackEnabled
               && string.Equals(deterministic.Reason, NoMatchReason, StringComparison.Ordinal);
    }

    /// <summary>
    /// Catálogo activo del dueño, o <c>null</c> cuando no se puede usar. Se piden SOLO las activas y se
    /// vuelve a filtrar por estado: una implementación que ignore <c>onlyActive</c> no puede colar una
    /// etiqueta retirada como destino.
    /// </summary>
    private async Task<ActiveCatalog?> LoadCatalogAsync(int userId, CancellationToken cancellationToken)
    {
        var loaded = await _labels.GetByUserIdAsync(userId, onlyActive: true);
        if (loaded is null)
        {
            return null;
        }

        var active = loaded
            .Where(label => label is not null && label.Active && label.LabelId > 0 && !string.IsNullOrWhiteSpace(label.Name))
            .ToList();

        if (active.Count is 0 or > EmailLlmResponseValidation.MaxLabels)
        {
            return null;
        }

        var byId = new Dictionary<int, EmailLabel>(active.Count);
        var labels = new List<EmailLlmLabel>(active.Count);

        foreach (var label in active)
        {
            if (!byId.TryAdd(label.LabelId, label))
            {
                // Ids repetidos: el modelo podría elegir «cuál de las dos» y no hay respuesta correcta.
                return null;
            }

            labels.Add(new EmailLlmLabel(label.LabelId, label.Name.Trim(), label.Description));
        }

        // Misma validación que el componente aplica al catálogo, antes de gastar la llamada.
        return EmailLlmResponseValidation.IsCatalogValid(labels) ? new ActiveCatalog(labels, byId) : null;
    }

    /// <summary>Traduce el motivo del componente a los motivos estables de la API.</summary>
    private static string MapReason(string? reason) => reason switch
    {
        EmailLlmReasons.ProviderUnavailable => EmailLlmReviewReason.Unavailable,
        EmailLlmReasons.Error => EmailLlmReviewReason.Unavailable,
        EmailLlmReasons.CatalogInvalid => EmailLlmReviewReason.CatalogInvalid,
        // uncertain, response_invalid, label_not_in_catalog, desconocido o nulo: el modelo no dio una
        // elección utilizable.
        _ => EmailLlmReviewReason.Uncertain
    };

    /// <summary>
    /// Revisión que conserva la regla y la procedencia del resultado determinista, sin etiqueta: nada
    /// se aplica al buzón y el motivo dice qué pasó con el modelo.
    /// </summary>
    private static EmailClassificationResult Review(EmailClassificationResult deterministic, string reason) => new(
        EmailClassificationOutcome.Review,
        null,
        null,
        null,
        deterministic.MatchedRuleId,
        deterministic.MatchedRuleName,
        deterministic.ClassifiedBy,
        reason);

    private sealed record ActiveCatalog(
        IReadOnlyList<EmailLlmLabel> Labels,
        IReadOnlyDictionary<int, EmailLabel> ById);
}
