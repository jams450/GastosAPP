using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Models.Email;

/// <summary>
/// Qué haría el clasificador con este correo. Es deliberadamente distinto del estado persistido:
/// el estado dice en qué punto quedó la fila, el resultado dice qué decidió el motor.
/// </summary>
public enum EmailClassificationOutcome
{
    /// <summary>La etiqueta manda a extraer un gasto.</summary>
    Expense,

    /// <summary>La etiqueta manda a extraer un ingreso (reembolsos, devoluciones).</summary>
    Income,

    /// <summary>Fuera del corte de antigüedad, o etiqueta con comportamiento <c>ignore</c>.</summary>
    Ignored,

    /// <summary>Etiqueta con comportamiento <c>none</c>: se archiva y no se extrae nada.</summary>
    Classified,

    /// <summary>
    /// Una regla con acción terminal (<c>review</c> o <c>llm</c>) decidió que el correo espera, o
    /// ninguna regla casó. Es una cola de trabajo, no una etiqueta.
    /// </summary>
    Review
}

public sealed record EmailClassificationResult(
    EmailClassificationOutcome Outcome,
    int? LabelId,
    string? LabelSlug,
    string? LabelBehavior,
    int? MatchedRuleId,
    string? MatchedRuleName,
    string ClassifiedBy,
    string Reason)
{
    /// <summary>Estado que le correspondería a la fila de <c>email_messages</c>.</summary>
    public string ProjectedState => Outcome switch
    {
        EmailClassificationOutcome.Expense => EmailMessageState.Drafted,
        EmailClassificationOutcome.Income => EmailMessageState.Drafted,
        EmailClassificationOutcome.Ignored => EmailMessageState.Ignored,
        EmailClassificationOutcome.Classified => EmailMessageState.Classified,
        _ => EmailMessageState.Review
    };

    public static EmailClassificationResult Review() => new(
        EmailClassificationOutcome.Review, null, null, null, null, null,
        EmailClassificationSource.None, "no_match");

    /// <summary>Fuera del corte de antigüedad: se descarta sin mirar las reglas.</summary>
    public static EmailClassificationResult TooOld() => new(
        EmailClassificationOutcome.Ignored, null, null, null, null, null,
        EmailClassificationSource.None, "too_old");

    public static EmailClassificationResult FromMatch(EmailRuleMatch match)
    {
        ArgumentNullException.ThrowIfNull(match);

        var action = EmailRuleAction.Normalize(match.Rule.Action);

        // El LLM decide en su capa: acá solo se marca que la regla lo pidió, y si ese camino no está
        // disponible o falla, el correo se queda en revisión. Nunca se aplica una etiqueta por esto.
        if (action == EmailRuleAction.Llm)
        {
            return ForRule(match, EmailClassificationOutcome.Review, "llm_requested");
        }

        // review, y también una acción desconocida: se falla cerrado hacia revisión y no se cae a la
        // regla siguiente, porque una fila corrupta no puede reescribir el destino de un correo.
        if (action != EmailRuleAction.AssignLabel)
        {
            return ForRule(match, EmailClassificationOutcome.Review, "rule_review");
        }

        // Defensa en profundidad: el evaluador ya exige una etiqueta activa, pero un match armado a
        // mano no puede inventar un destino ni escribir sobre una etiqueta retirada.
        if (match.Label is not { Active: true })
        {
            return ForRule(match, EmailClassificationOutcome.Review, "rule_review");
        }

        var behavior = match.Label.Behavior;
        var outcome = behavior switch
        {
            EmailLabelBehavior.Expense => EmailClassificationOutcome.Expense,
            EmailLabelBehavior.Income => EmailClassificationOutcome.Income,
            EmailLabelBehavior.Ignore => EmailClassificationOutcome.Ignored,
            _ => EmailClassificationOutcome.Classified
        };

        return new EmailClassificationResult(
            outcome,
            match.Label.LabelId,
            match.Label.Slug,
            behavior,
            match.Rule.EmailRuleId,
            match.Rule.Name,
            EmailClassificationSource.Rule,
            "rule");
    }

    /// <summary>
    /// Revisión pedida por una regla: conserva la regla que la pidió (para que la cola y el detalle
    /// puedan mostrarla) y no lleva etiqueta, porque ninguna se aplica. El motivo distingue
    /// <c>rule_review</c> de <c>llm_requested</c> y de <c>no_match</c>.
    /// </summary>
    private static EmailClassificationResult ForRule(
        EmailRuleMatch match,
        EmailClassificationOutcome outcome,
        string reason) => new(
        outcome,
        null,
        null,
        null,
        match.Rule.EmailRuleId,
        match.Rule.Name,
        EmailClassificationSource.Rule,
        reason);

    /// <summary>Resultado cuando el veredicto lo dio el LLM y no una regla.</summary>
    public static EmailClassificationResult FromLabel(EmailLabel label, string reason) => new(
        label.Behavior switch
        {
            EmailLabelBehavior.Expense => EmailClassificationOutcome.Expense,
            EmailLabelBehavior.Income => EmailClassificationOutcome.Income,
            EmailLabelBehavior.Ignore => EmailClassificationOutcome.Ignored,
            _ => EmailClassificationOutcome.Classified
        },
        label.LabelId,
        label.Slug,
        label.Behavior,
        null,
        null,
        EmailClassificationSource.Llm,
        reason);
}

/// <summary>
/// Configuración del clasificador (<c>Email</c> en appsettings o variables de entorno).
/// </summary>
public sealed class EmailClassifierOptions
{
    public const string SectionName = "Email";

    /// <summary>
    /// Corte de antigüedad en días. Cero o negativo lo desactiva. 730 son dos años, que es el
    /// alcance acordado para el histórico.
    /// </summary>
    public int DropOlderThanDays { get; set; } = 730;

    /// <summary>
    /// Si el LLM puede decidir cuando ninguna regla casó. Apagado por defecto: encenderlo es una
    /// decisión de costo, no un detalle de configuración.
    /// </summary>
    public bool LlmFallbackEnabled { get; set; }

    /// <summary>
    /// Tope de llamadas al LLM por corrida. Sin tope, un buzón grande convierte el respaldo en la
    /// ruta principal, que es exactamente lo que el respaldo debía evitar.
    /// </summary>
    public int LlmMaxPerRun { get; set; } = 20;
}
