using GastosApp.BusinessLogic.Models.Email;
using GastosApp.Models.Entities;
using Xunit;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Reglas con AND/OR anidados. El caso que las motivó es real: Mercado Libre manda varios tipos de
/// correo desde el mismo dominio, y solo el asunto dice cuál es un cargo. Con una condición por regla
/// eso no se puede expresar sin que cualquier remitente con la misma palabra también case.
/// </summary>
public class EmailRuleGroupEvaluatorTests
{
    private static EmailLabel Label(string slug, string behavior = EmailLabelBehavior.Expense, bool active = true) => new()
    {
        LabelId = slug.GetHashCode() & 0x7FFFFF,
        Name = slug,
        Slug = slug,
        Behavior = behavior,
        Active = active
    };

    private static EmailRuleCondition Condition(
        string matchField,
        string matchType,
        string matchValue) => new()
    {
        MatchField = matchField,
        MatchType = matchType,
        MatchValue = matchValue
    };

    private static EmailRuleGroup Group(string combinator, EmailRuleCondition[]? conditions = null, EmailRuleGroup[]? children = null) => new()
    {
        Combinator = combinator,
        Conditions = conditions ?? Array.Empty<EmailRuleCondition>(),
        Children = children ?? Array.Empty<EmailRuleGroup>()
    };

    private static EmailRule Rule(EmailRuleGroup root, EmailLabel label, int id = 1, int priority = 100) => new()
    {
        EmailRuleId = id,
        Name = $"rule-{id}",
        TargetLabelId = label.LabelId,
        TargetLabel = label,
        Priority = priority,
        Active = true,
        // Sin columna legacy: con grupos, las columnas match_* se ignoran a propósito.
        MatchField = string.Empty,
        MatchType = string.Empty,
        MatchValue = string.Empty,
        Groups = new List<EmailRuleGroup> { root }
    };

    private static EmailMessageCandidate Mail(string from = "avisos@mercadolibre.com", string subject = "") =>
        new(from, null, subject, new DateTime(2026, 10, 29, 10, 0, 0, DateTimeKind.Utc));

    [Fact]
    public void And_requires_every_condition()
    {
        var label = Label("gastos");
        var root = Group(EmailRuleGroupCombinator.And, new[]
        {
            Condition(EmailRuleMatchField.SenderDomain, EmailRuleMatchType.EndsWith, "mercadolibre.com"),
            Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "compraste")
        });

        var rule = Rule(root, label);

        Assert.NotNull(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Compraste un producto")));
        // Mismo dominio, asunto distinto: la regla no casa y el correo cae al siguiente veredicto.
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Tu resumen mensual")));
        // El asunto sí, pero otro remitente: tampoco.
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(from: "otro@ejemplo.com", subject: "Compraste un producto")));
    }

    [Fact]
    public void Or_accepts_any_condition()
    {
        var label = Label("compras", EmailLabelBehavior.None);
        var root = Group(EmailRuleGroupCombinator.Or, new[]
        {
            Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "compraste"),
            Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "pagaste")
        });

        var rule = Rule(root, label);

        Assert.NotNull(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Pagaste tu compra")));
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Tu resumen mensual")));
    }

    [Fact]
    public void Nested_groups_combine_domain_with_an_or_of_subjects()
    {
        var label = Label("gastos");
        var subjectGroup = Group(EmailRuleGroupCombinator.Or, new[]
        {
            Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "compraste"),
            Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "pagaste")
        });
        var root = Group(EmailRuleGroupCombinator.And, new[]
        {
            Condition(EmailRuleMatchField.SenderDomain, EmailRuleMatchType.EndsWith, "mercadolibre.com")
        }, new[] { subjectGroup });

        var rule = Rule(root, label);

        Assert.NotNull(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Pagaste tu compra")));
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Tu resumen mensual")));
    }

    [Fact]
    public void An_empty_group_never_matches()
    {
        // Una regla a medio configurar no puede volverse comodín: se llevaría correo de todo el mundo.
        var label = Label("gastos");
        var rule = Rule(Group(EmailRuleGroupCombinator.And), label);

        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Compraste un producto")));
    }

    [Fact]
    public void An_or_group_with_an_empty_child_still_needs_a_true_branch()
    {
        var label = Label("gastos");
        var root = Group(EmailRuleGroupCombinator.Or, new[]
        {
            Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "compraste")
        }, new[] { Group(EmailRuleGroupCombinator.And) });

        var rule = Rule(root, label);

        Assert.NotNull(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Compraste algo")));
        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "Otra cosa")));
    }

    [Fact]
    public void A_rule_with_groups_ignores_its_legacy_match_columns()
    {
        var label = Label("gastos");
        var root = Group(EmailRuleGroupCombinator.And, new[]
        {
            Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "compraste")
        });

        var rule = Rule(root, label);
        rule.MatchField = EmailRuleMatchField.Sender;
        rule.MatchType = EmailRuleMatchType.Contains;
        rule.MatchValue = "cualquiera";

        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(from: "cualquiera@ejemplo.com", subject: "otra cosa")));
    }
}
