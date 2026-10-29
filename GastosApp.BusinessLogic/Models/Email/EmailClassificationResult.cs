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

    /// <summary>Ninguna regla casó. Es una cola de trabajo, no una etiqueta.</summary>
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
