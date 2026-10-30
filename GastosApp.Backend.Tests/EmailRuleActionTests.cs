using System.Text.Json;
using GastosApp.API.Models.EmailRules;
using GastosApp.BusinessLogic.Models.Email;
using GastosApp.Models.Entities;
using Xunit;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Negación (S14) y acciones terminales (S15) de las reglas de correo.
/// <para>
/// La regla que motivó la negación es real y su forma importa:
/// <c>dominio holatransfers.com Y NO (asunto contiene factura O invoice O comprobante de pago)</c>.
/// El «NO» se expresa con <c>negated</c> en la condición o en el grupo, no con comparadores nuevos:
/// cuatro comparadores por cada operador es cómo se llega a «no_contiene» y a un motor que ya nadie
/// puede auditar.
/// </para>
/// <para>
/// Las acciones terminales también son de negocio: una regla puede mandar el correo a revisión o al
/// LLM en vez de asignar una etiqueta. La primera regla que casa decide y la evaluación se detiene,
/// así que una regla de revisión no puede ser adelantada por una asignación posterior.
/// </para>
/// </summary>
public class EmailRuleActionTests
{
    private static readonly DateTime ReceivedAt = new(2026, 10, 30, 10, 0, 0, DateTimeKind.Utc);

    private static EmailLabel Label(
        int labelId,
        string slug,
        string behavior = EmailLabelBehavior.Expense,
        bool active = true) => new()
    {
        LabelId = labelId,
        Name = slug,
        Slug = slug,
        Behavior = behavior,
        Active = active
    };

    private static EmailRuleCondition Condition(
        string matchField,
        string matchType,
        string matchValue,
        bool negated = false) => new()
    {
        MatchField = matchField,
        MatchType = matchType,
        MatchValue = matchValue,
        Negated = negated
    };

    private static EmailRuleGroup Group(
        string combinator,
        EmailRuleCondition[]? conditions = null,
        EmailRuleGroup[]? children = null,
        bool negated = false) => new()
    {
        Combinator = combinator,
        Conditions = conditions ?? Array.Empty<EmailRuleCondition>(),
        Children = children ?? Array.Empty<EmailRuleGroup>(),
        Negated = negated
    };

    private static EmailRule Rule(
        int id,
        string action,
        EmailLabel? label,
        EmailRuleGroup? root = null,
        int priority = 100) => new()
    {
        EmailRuleId = id,
        Name = $"rule-{id}",
        Action = action,
        TargetLabelId = label?.LabelId,
        TargetLabel = label,
        Priority = priority,
        Active = true,
        // Las columnas planas son el modelo anterior; con árbol el motor las ignora.
        MatchField = string.Empty,
        MatchType = string.Empty,
        MatchValue = string.Empty,
        Groups = root is null ? new List<EmailRuleGroup>() : new List<EmailRuleGroup> { root }
    };

    private static EmailMessageCandidate Mail(string? from = "avisos@holatransfers.com", string subject = "Tu traslado confirmado") =>
        new(from, null, subject, ReceivedAt);

    private static EmailRuleGroup SubjectTree(string value, bool negated = false) =>
        Group(
            EmailRuleGroupCombinator.And,
            new[] { Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, value, negated) });

    [Fact]
    public void Not_over_a_group_keeps_the_transfer_mail_and_drops_the_invoice()
    {
        var gastos = Label(1, "gastos");
        var exclusions = Group(
            EmailRuleGroupCombinator.Or,
            new[]
            {
                Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "factura"),
                Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "invoice"),
                Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "comprobante de pago")
            },
            negated: true);
        var root = Group(
            EmailRuleGroupCombinator.And,
            new[] { Condition(EmailRuleMatchField.SenderDomain, EmailRuleMatchType.EndsWith, "holatransfers.com") },
            new[] { exclusions });
        var rule = Rule(1, EmailRuleAction.AssignLabel, gastos, root);

        Assert.NotNull(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Tu traslado confirmado")));

        // El «NO» cubre las tres palabras del grupo: cualquiera de ellas saca al correo de la regla.
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Tu factura de traslado")));
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Invoice for your transfer")));
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Comprobante de pago disponible")));

        // Negar el grupo no exime de la otra condición: otro remitente sigue sin casar.
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(from: "avisos@otra.com")));
    }

    [Fact]
    public void Not_on_a_single_condition_inverts_only_that_condition()
    {
        var gastos = Label(1, "gastos");
        var root = Group(
            EmailRuleGroupCombinator.And,
            new[]
            {
                Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "recibo"),
                Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "cancelado", negated: true)
            });
        var rule = Rule(1, EmailRuleAction.AssignLabel, gastos, root);

        Assert.NotNull(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Recibo de tu compra")));
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Recibo cancelado")));
        // La condición negada sola no basta: el «Y» sigue exigiendo la primera.
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Aviso de tu compra")));
    }

    [Fact]
    public void Double_negation_restores_the_condition()
    {
        // NO(NO(contiene factura)) = contiene factura. Una doble negación mal aplicada (negar cada
        // hijo en vez del resultado) haría lo contrario y nadie lo notaría hasta ver correo perdido.
        var gastos = Label(1, "gastos");
        var root = Group(
            EmailRuleGroupCombinator.And,
            new[] { Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "factura", negated: true) },
            negated: true);
        var rule = Rule(1, EmailRuleAction.AssignLabel, gastos, root);

        Assert.NotNull(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Tu factura")));
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Tu recibo")));
    }

    [Fact]
    public void Negation_of_a_nested_group_does_not_escape_its_parent()
    {
        // NO(factura Y comprobante) O urgente. Negar el grupo interno no debe convertir el «O» en un
        // comodín: solo invierte el resultado de ese subgrupo.
        var gastos = Label(1, "gastos");
        var inner = Group(
            EmailRuleGroupCombinator.And,
            new[]
            {
                Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "factura"),
                Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "comprobante")
            },
            negated: true);
        var root = Group(
            EmailRuleGroupCombinator.Or,
            new[] { Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "urgente") },
            new[] { inner });
        var rule = Rule(1, EmailRuleAction.AssignLabel, gastos, root);

        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Factura con comprobante")));
        Assert.NotNull(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Factura sin el otro documento")));
        Assert.NotNull(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Urgente: factura con comprobante")));
    }

    [Fact]
    public void An_empty_group_stays_false_even_negated()
    {
        // Un grupo vacío no casa. Negarlo tampoco puede encenderlo: sería el comodín accidental que
        // manda a esta regla todo el correo que ninguna otra quiso.
        var gastos = Label(1, "gastos");
        var emptyNegated = Rule(1, EmailRuleAction.AssignLabel, gastos, Group(EmailRuleGroupCombinator.And, negated: true));

        Assert.Null(EmailRuleEvaluator.Match(new[] { emptyNegated }, Mail()));

        var withEmptyChild = Rule(
            2,
            EmailRuleAction.AssignLabel,
            gastos,
            Group(
                EmailRuleGroupCombinator.And,
                new[] { Condition(EmailRuleMatchField.SenderDomain, EmailRuleMatchType.EndsWith, "holatransfers.com") },
                new[] { Group(EmailRuleGroupCombinator.And, negated: true) }));

        Assert.Null(EmailRuleEvaluator.Match(new[] { withEmptyChild }, Mail()));
    }

    [Fact]
    public void An_invalid_condition_stays_false_even_negated()
    {
        var gastos = Label(1, "gastos");

        // Valor vacío: el servicio lo rechaza al guardar, pero una fila corrupta no puede volverse
        // «todo el correo» por el «NO».
        var emptyValue = Rule(
            1,
            EmailRuleAction.AssignLabel,
            gastos,
            Group(
                EmailRuleGroupCombinator.And,
                new[] { Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, string.Empty, negated: true) }));

        Assert.Null(EmailRuleEvaluator.Match(new[] { emptyValue }, Mail()));

        var unknownField = Rule(
            2,
            EmailRuleAction.AssignLabel,
            gastos,
            Group(
                EmailRuleGroupCombinator.And,
                new[] { Condition("body", EmailRuleMatchType.Contains, "factura", negated: true) }));

        Assert.Null(EmailRuleEvaluator.Match(new[] { unknownField }, Mail()));

        var unknownType = Rule(
            3,
            EmailRuleAction.AssignLabel,
            gastos,
            Group(
                EmailRuleGroupCombinator.And,
                new[] { Condition(EmailRuleMatchField.Subject, "regex", "fact.*", negated: true) }));

        Assert.Null(EmailRuleEvaluator.Match(new[] { unknownType }, Mail()));
    }

    [Fact]
    public void A_valid_condition_on_missing_text_can_be_negated()
    {
        // Caso distinto al de arriba a propósito: la condición es válida y el campo del correo falta,
        // así que la comparación da falso y el «NO» lo invierte. Es lógica normal, no un comodín.
        var gastos = Label(1, "gastos");
        var rule = Rule(
            1,
            EmailRuleAction.AssignLabel,
            gastos,
            Group(
                EmailRuleGroupCombinator.And,
                new[] { Condition(EmailRuleMatchField.Sender, EmailRuleMatchType.Contains, "banco", negated: true) }));

        Assert.NotNull(EmailRuleEvaluator.Match(new[] { rule }, Mail(from: null)));
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(from: "avisos@banco.com")));
    }

    [Fact]
    public void A_group_deeper_than_the_limit_never_matches_even_when_negated()
    {
        // La relación padre-hijo vive en la base y puede tener ciclos; el tope existe para no perder
        // la pila. Pasado el tope la respuesta es «no casa», y el «NO» no la convierte en «casa».
        var gastos = Label(1, "gastos");
        EmailRuleGroup root = SubjectTree("factura", negated: true);
        for (var level = 0; level < 12; level++)
        {
            root = Group(EmailRuleGroupCombinator.And, null, new[] { root }, negated: true);
        }

        var rule = Rule(1, EmailRuleAction.AssignLabel, gastos, root);

        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Tu factura")));
    }

    [Fact]
    public void A_review_rule_stops_before_a_later_assignment()
    {
        // La etiqueta «Eliminar» existe y está activa, y aun así no se aplica: la regla de revisión
        // tiene prioridad y es terminal. Sin esto, el correo que el usuario mandó a revisión se iría
        // al descarte sin pasar por sus ojos.
        var eliminar = Label(2, "eliminar", EmailLabelBehavior.Ignore);
        var reviewRule = Rule(1, EmailRuleAction.Review, null, SubjectTree("factura"), priority: 10);
        var assignRule = Rule(2, EmailRuleAction.AssignLabel, eliminar, SubjectTree("factura"), priority: 100);

        var match = EmailRuleEvaluator.Match(new[] { reviewRule, assignRule }, Mail(subject: "Tu factura"));

        Assert.NotNull(match);
        Assert.Equal(1, match!.Rule.EmailRuleId);
        Assert.Null(match.Label);

        var result = EmailClassificationResult.FromMatch(match);
        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Null(result.LabelSlug);
        Assert.Null(result.LabelBehavior);
        Assert.Equal(1, result.MatchedRuleId);
        Assert.Equal("rule-1", result.MatchedRuleName);
        Assert.Equal(EmailClassificationSource.Rule, result.ClassifiedBy);
        Assert.Equal("rule_review", result.Reason);
        Assert.Equal(EmailMessageState.Review, result.ProjectedState);

        // Sin etiqueta no hay nada que escribir en el buzón: la elegibilidad del etiquetado ya depende
        // de <c>LabelId</c>, así que una revisión no puede entrar en ningún plan de aplicación.
        Assert.False(GastosApp.API.Services.Email.ImapApplyPolicy.IsEligible(result));
    }

    [Fact]
    public void A_review_rule_with_an_inactive_label_is_still_terminal()
    {
        // Fila defensiva: la base exige target_label_id NULL para review/llm, pero si alguna vez
        // quedara una etiqueta ahí —o quedara inactiva— la acción manda. Saltarla la haría caer en la
        // asignación posterior, que es exactamente lo que la acción terminal prohíbe.
        var retired = Label(3, "retirada", active: false);
        var eliminar = Label(2, "eliminar", EmailLabelBehavior.Ignore);
        var reviewRule = Rule(1, EmailRuleAction.Review, retired, SubjectTree("factura"), priority: 10);
        var assignRule = Rule(2, EmailRuleAction.AssignLabel, eliminar, SubjectTree("factura"), priority: 100);

        var match = EmailRuleEvaluator.Match(new[] { reviewRule, assignRule }, Mail(subject: "Tu factura"));

        Assert.NotNull(match);
        Assert.Equal(1, match!.Rule.EmailRuleId);

        var result = EmailClassificationResult.FromMatch(match);
        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Equal("rule_review", result.Reason);
    }

    [Fact]
    public void An_llm_rule_stops_evaluation_and_asks_for_the_model()
    {
        var eliminar = Label(2, "eliminar", EmailLabelBehavior.Ignore);
        var llmRule = Rule(1, EmailRuleAction.Llm, null, SubjectTree("factura"), priority: 10);
        var assignRule = Rule(2, EmailRuleAction.AssignLabel, eliminar, SubjectTree("factura"), priority: 100);

        var match = EmailRuleEvaluator.Match(new[] { llmRule, assignRule }, Mail(subject: "Tu factura"));

        Assert.NotNull(match);
        Assert.Equal(1, match!.Rule.EmailRuleId);

        var result = EmailClassificationResult.FromMatch(match);
        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Equal(1, result.MatchedRuleId);
        Assert.Equal("llm_requested", result.Reason);
        Assert.Equal(EmailClassificationSource.Rule, result.ClassifiedBy);
        Assert.False(GastosApp.API.Services.Email.ImapApplyPolicy.IsEligible(result));
    }

    [Fact]
    public void An_unknown_action_fails_closed_to_review_and_never_falls_through()
    {
        // Una acción que el código no conoce (fila corrupta o versión futura) no puede comportarse
        // como «asignar» ni dejar que decida la regla siguiente: termina en revisión.
        var eliminar = Label(2, "eliminar", EmailLabelBehavior.Ignore);
        var broken = Rule(1, "delete", eliminar, SubjectTree("factura"), priority: 10);
        var assignRule = Rule(2, EmailRuleAction.AssignLabel, eliminar, SubjectTree("factura"), priority: 100);

        var match = EmailRuleEvaluator.Match(new[] { broken, assignRule }, Mail(subject: "Tu factura"));

        Assert.NotNull(match);
        Assert.Equal(1, match!.Rule.EmailRuleId);

        var result = EmailClassificationResult.FromMatch(match);
        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Equal(1, result.MatchedRuleId);
        Assert.Equal("rule_review", result.Reason);
    }

    [Fact]
    public void Assignment_keeps_its_existing_behaviour()
    {
        // Comportamiento previo que se conserva: asignar sigue produciendo el resultado de la etiqueta.
        var gastos = Label(1, "gastos", EmailLabelBehavior.Expense);
        var rule = Rule(1, EmailRuleAction.AssignLabel, gastos, SubjectTree("factura"));

        var match = EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Tu factura"));

        Assert.NotNull(match);

        var result = EmailClassificationResult.FromMatch(match!);
        Assert.Equal(EmailClassificationOutcome.Expense, result.Outcome);
        Assert.Equal(1, result.LabelId);
        Assert.Equal("gastos", result.LabelSlug);
        Assert.Equal(EmailLabelBehavior.Expense, result.LabelBehavior);
        Assert.Equal(1, result.MatchedRuleId);
        Assert.Equal(EmailClassificationSource.Rule, result.ClassifiedBy);
        Assert.Equal("rule", result.Reason);
    }

    [Fact]
    public void An_assignment_without_a_usable_label_fails_to_review()
    {
        // Defensa en profundidad: el evaluador ya salta la asignación sin etiqueta activa, pero si un
        // llamador construye el match a mano, el resultado no puede inventar una etiqueta.
        var assignWithoutLabel = Rule(1, EmailRuleAction.AssignLabel, null, SubjectTree("factura"));
        var missing = EmailClassificationResult.FromMatch(new EmailRuleMatch(assignWithoutLabel, null));

        Assert.Equal(EmailClassificationOutcome.Review, missing.Outcome);
        Assert.Null(missing.LabelId);
        Assert.Equal(1, missing.MatchedRuleId);
        Assert.Equal("rule_review", missing.Reason);

        var retired = Label(3, "retirada", active: false);
        var assignInactive = Rule(2, EmailRuleAction.AssignLabel, retired, SubjectTree("factura"));
        var inactive = EmailClassificationResult.FromMatch(new EmailRuleMatch(assignInactive, retired));

        Assert.Equal(EmailClassificationOutcome.Review, inactive.Outcome);
        Assert.Null(inactive.LabelId);
    }

    [Fact]
    public void No_match_still_reviews_without_rule_metadata()
    {
        // Comportamiento previo que se conserva: sin regla no hay motivo de regla ni identificador.
        var gastos = Label(1, "gastos");
        var rule = Rule(1, EmailRuleAction.AssignLabel, gastos, SubjectTree("factura"));

        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Tu resumen")));

        var review = EmailClassificationResult.Review();
        Assert.Equal(EmailClassificationOutcome.Review, review.Outcome);
        Assert.Null(review.MatchedRuleId);
        Assert.Null(review.LabelId);
        Assert.Equal("no_match", review.Reason);
        Assert.Equal(EmailClassificationSource.None, review.ClassifiedBy);
    }

    [Fact]
    public void Actions_normalize_to_the_persisted_values_and_unknown_ones_do_not()
    {
        // Compatibilidad con el modelo anterior: una fila sin acción (o con el campo vacío) asigna
        // etiqueta, que es lo que hacían todas las reglas antes de S15.
        Assert.Equal(EmailRuleAction.AssignLabel, EmailRuleAction.Normalize(null));
        Assert.Equal(EmailRuleAction.AssignLabel, EmailRuleAction.Normalize("  "));
        Assert.Equal(EmailRuleAction.AssignLabel, EmailRuleAction.Normalize("Assign_Label"));
        Assert.Equal(EmailRuleAction.Review, EmailRuleAction.Normalize("REVIEW"));
        Assert.Equal(EmailRuleAction.Llm, EmailRuleAction.Normalize(" llm "));

        // Desconocida no se degrada a un valor válido: el motor la trata como revisión.
        Assert.Null(EmailRuleAction.Normalize("delete"));
        Assert.Null(EmailRuleAction.Normalize("llm_fallback"));
    }

    [Fact]
    public void Negation_and_action_roundtrip_through_the_api_contract_with_legacy_defaults()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);

        // Una petición anterior al cambio (sin action ni negated) sigue siendo una regla válida.
        var legacyGroup = JsonSerializer.Deserialize<EmailRuleGroupDto>(
            """{"combinator":"and","conditions":[{"matchField":"subject","matchType":"contains","matchValue":"factura"}],"groups":[]}""",
            options);

        Assert.NotNull(legacyGroup);
        Assert.False(legacyGroup!.Negated);
        Assert.False(legacyGroup.Conditions[0].Negated);

        var legacyRequest = JsonSerializer.Deserialize<EmailRuleUpdateRequest>(
            """{"name":"Recibos","matchField":"subject","matchType":"contains","matchValue":"factura","targetLabelId":3}""",
            options);

        Assert.NotNull(legacyRequest);
        Assert.Equal(EmailRuleAction.AssignLabel, legacyRequest!.Action);
        Assert.Equal(3, legacyRequest.TargetLabelId);

        // Una regla terminal viaja sin etiqueta y con el «NO» en el grupo y en la condición.
        var terminal = new EmailRuleUpdateRequest
        {
            Name = "Revisar facturas",
            Action = EmailRuleAction.Review,
            TargetLabelId = null,
            Root = new EmailRuleGroupDto
            {
                Combinator = "and",
                Negated = true,
                Conditions = new List<EmailRuleConditionDto>
                {
                    new() { MatchField = "subject", MatchType = "contains", MatchValue = "factura", Negated = true }
                }
            }
        };

        var json = JsonSerializer.Serialize(terminal, options);
        Assert.Contains("\"action\":\"review\"", json);
        Assert.Contains("\"targetLabelId\":null", json);
        Assert.Contains("\"negated\":true", json);

        var back = JsonSerializer.Deserialize<EmailRuleUpdateRequest>(json, options);
        Assert.NotNull(back);
        Assert.Equal(EmailRuleAction.Review, back!.Action);
        Assert.Null(back.TargetLabelId);
        Assert.True(back.Root!.Negated);
        Assert.True(back.Root.Conditions[0].Negated);
    }
}
