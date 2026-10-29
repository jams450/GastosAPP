using GastosApp.BusinessLogic.Models.Email;
using GastosApp.Models.Entities;
using Xunit;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Motor de clasificación de correo. Es una función pura sobre reglas y etiquetas ya cargadas, así
/// que se prueba sin base de datos: lo que se afirma aquí es la precedencia y el corte, que son
/// justo las dos cosas que se rompen en silencio.
/// </summary>
public class EmailRuleEvaluatorTests
{
    private static readonly DateTime Now = new(2026, 10, 29, 12, 0, 0, DateTimeKind.Utc);

    private static EmailLabel Label(string slug, string behavior, bool active = true) => new()
    {
        LabelId = slug.GetHashCode() & 0x7FFFFF,
        Name = slug,
        Slug = slug,
        Behavior = behavior,
        Active = active
    };

    private static EmailRule Rule(
        int id,
        string matchField,
        string matchType,
        string matchValue,
        EmailLabel label,
        int priority = 100,
        bool active = true) => new()
    {
        EmailRuleId = id,
        Name = $"rule-{id}",
        MatchField = matchField,
        MatchType = matchType,
        MatchValue = matchValue,
        TargetLabelId = label.LabelId,
        TargetLabel = label,
        Priority = priority,
        Active = active
    };

    private static EmailMessageCandidate Mail(
        string? from = "no-reply@netflix.com",
        string? subject = "Tu recibo de Netflix",
        DateTime? receivedAt = null) => new(
        from,
        null,
        subject,
        receivedAt ?? Now.AddDays(-1));

    [Fact]
    public void Highest_priority_wins_when_two_rules_match()
    {
        var gastos = Label("gastos", EmailLabelBehavior.Expense);
        var banco = Label("banco", EmailLabelBehavior.Expense);

        var low = Rule(1, EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Contains, "netflix.com", gastos, priority: 100);
        var high = Rule(2, EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Contains, "netflix.com", banco, priority: 10);

        var match = EmailRuleEvaluator.Match(new[] { low, high }, Mail());

        Assert.NotNull(match);
        Assert.Equal(2, match!.Rule.EmailRuleId);
        Assert.Equal("banco", match.Label.Slug);
    }

    [Fact]
    public void Equal_priority_is_resolved_by_rule_id()
    {
        var first = Label("gastos", EmailLabelBehavior.Expense);
        var second = Label("otros", EmailLabelBehavior.None);

        var lowId = Rule(5, EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Exact, "netflix.com", first);
        var highId = Rule(9, EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Exact, "netflix.com", second);

        var match = EmailRuleEvaluator.Match(new[] { highId, lowId }, Mail());

        Assert.NotNull(match);
        Assert.Equal(5, match!.Rule.EmailRuleId);
    }

    [Fact]
    public void Ends_with_matches_the_notice_that_shares_a_sender_with_real_receipts()
    {
        var ignore = Label("avisos", EmailLabelBehavior.Ignore);
        var rule = Rule(1, EmailRuleMatchField.Subject, EmailRuleMatchType.EndsWith,
            "nuevos terminos y condiciones", ignore);

        var match = EmailRuleEvaluator.Match(new[] { rule }, Mail(subject: "BBVA - Nuevos Términos y Condiciones"));

        Assert.NotNull(match);
        Assert.Equal(EmailLabelBehavior.Ignore, match!.Label.Behavior);
    }

    [Fact]
    public void Sender_address_and_subject_are_compared_normalized()
    {
        var gastos = Label("gastos", EmailLabelBehavior.Expense);
        // El valor de la regla se persiste ya normalizado; el que llega del correo no. Este caso fija
        // ese contrato: la normalización del mensaje es responsabilidad del evaluador.
        var rule = Rule(1, EmailRuleMatchField.Sender, EmailRuleMatchType.Exact, "no-reply@netflix.com", gastos);

        var match = EmailRuleEvaluator.Match(new[] { rule }, Mail(from: "No-Reply@Netflix.COM"));

        Assert.NotNull(match);
    }

    [Fact]
    public void Sender_domain_is_derived_when_the_source_does_not_provide_it()
    {
        var gastos = Label("gastos", EmailLabelBehavior.Expense);
        // El dominio se compara literal, incluidos subdominios: "es paypal" se expresa con
        // contains o ends_with, nunca con una regla oculta de subdominios.
        var rule = Rule(1, EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Contains, "paypal.com", gastos);

        var match = EmailRuleEvaluator.Match(new[] { rule }, Mail(from: "service@mail.paypal.com"));

        Assert.NotNull(match);
    }

    [Fact]
    public void Sender_domain_exact_does_not_silently_match_a_subdomain()
    {
        var gastos = Label("gastos", EmailLabelBehavior.Expense);
        var rule = Rule(1, EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Exact, "paypal.com", gastos);

        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(from: "service@mail.paypal.com")));
    }

    [Fact]
    public void Inactive_rule_never_matches()
    {
        var gastos = Label("gastos", EmailLabelBehavior.Expense);
        var rule = Rule(1, EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Contains, "netflix.com", gastos, active: false);

        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail()));
    }

    [Fact]
    public void Rule_pointing_at_an_inactive_label_falls_through_to_the_next_rule()
    {
        var retired = Label("retirada", EmailLabelBehavior.Expense, active: false);
        var gastos = Label("gastos", EmailLabelBehavior.Expense);

        var retiredRule = Rule(1, EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Contains, "netflix.com", retired, priority: 10);
        var liveRule = Rule(2, EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Contains, "netflix.com", gastos, priority: 100);

        var match = EmailRuleEvaluator.Match(new[] { retiredRule, liveRule }, Mail());

        Assert.NotNull(match);
        Assert.Equal(2, match!.Rule.EmailRuleId);
    }

    [Fact]
    public void No_matching_rule_is_review_not_ignore()
    {
        var gastos = Label("gastos", EmailLabelBehavior.Expense);
        var rule = Rule(1, EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Exact, "netflix.com", gastos);

        Assert.Null(EmailRuleEvaluator.Match(new[] { rule }, Mail(from: "alguien@desconocido.mx")));
    }

    [Fact]
    public void Message_older_than_the_cutoff_is_outside_the_age_limit()
    {
        var tooOld = Now.AddDays(-731);

        Assert.False(EmailRuleEvaluator.IsWithinAgeLimit(tooOld, Now, 730));
        Assert.True(EmailRuleEvaluator.IsWithinAgeLimit(Now.AddDays(-730), Now, 730));
    }

    [Fact]
    public void Age_limit_can_be_disabled()
    {
        Assert.True(EmailRuleEvaluator.IsWithinAgeLimit(Now.AddYears(-10), Now, 0));
    }
}
