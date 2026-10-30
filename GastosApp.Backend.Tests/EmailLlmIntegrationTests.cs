using GastosApp.AI.Email;
using GastosApp.API.Configuration;
using GastosApp.API.Models.EmailClassification;
using GastosApp.API.Services.Email;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Email;
using GastosApp.Models.Entities;
using MailKit;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Integración del respaldo LLM del clasificador de correo (S15) en la capa API.
/// <para>
/// El componente de <c>GastosApp.AI</c> ya está probado por su cuenta. Lo que se fija aquí es el
/// contrato del orquestador, que es donde un error se ve como correo mal etiquetado:
/// <list type="bullet">
/// <item>el motor determinista corre SIEMPRE primero y es el único que decide la acción terminal;</item>
/// <item>solo <c>llm_requested</c> ramifica al modelo, y solo si la regla lo pidió; el respaldo de
/// <c>no_match</c> existe pero está apagado por defecto;</item>
/// <item>un presupuesto por corrida —no por mensaje— acota las llamadas, y el intento se reserva
/// antes de llamar, incluso si falla;</item>
/// <item>toda falla (sin proveedor, presupuesto agotado, catálogo inválido, respuesta dudosa o
/// excepción) termina en revisión conservando la regla que la pidió, nunca en una etiqueta
/// posterior;</item>
/// <item>el catálogo son las etiquetas activas del usuario, sin truncar: más de 200 falla cerrado, y
/// una etiqueta de descarte como «Eliminar» es una elección válida.</item>
/// </list>
/// Ninguna prueba abre red, base de datos, Gmail ni un modelo real: el clasificador determinista y el
/// componente LLM son dobles, y el orquestador es el real.
/// </para>
/// </summary>
public class EmailLlmIntegrationTests
{
    private const int OwnerId = 42;

    private static readonly DateTime ReceivedAt = new(2026, 11, 2, 10, 0, 0, DateTimeKind.Utc);

    private static EmailMessageCandidate Mail(string subject = "Cargo en tu tarjeta") =>
        new("avisos@banco.com", null, subject, ReceivedAt);

    private static EmailLabel Label(
        int labelId,
        string name,
        string behavior = EmailLabelBehavior.Expense,
        bool active = true,
        string? description = null) => new()
    {
        LabelId = labelId,
        Name = name,
        Slug = name.ToLowerInvariant(),
        Behavior = behavior,
        Active = active,
        Description = description
    };

    /// <summary>Resultado real del motor determinista cuando la regla pide el modelo.</summary>
    private static EmailClassificationResult LlmRequested(int ruleId = 5, string name = "Revisar con LLM") =>
        EmailClassificationResult.FromMatch(new EmailRuleMatch(
            new EmailRule { EmailRuleId = ruleId, Name = name, Action = EmailRuleAction.Llm },
            null));

    /// <summary>Resultado real del motor determinista cuando la regla manda a revisión.</summary>
    private static EmailClassificationResult RuleReview(int ruleId = 6, string name = "Revisar facturas") =>
        EmailClassificationResult.FromMatch(new EmailRuleMatch(
            new EmailRule { EmailRuleId = ruleId, Name = name, Action = EmailRuleAction.Review },
            null));

    /// <summary>Resultado real del motor determinista cuando la regla asigna etiqueta.</summary>
    private static EmailClassificationResult Assigned(int labelId = 7, string name = "Gastos") =>
        EmailClassificationResult.FromMatch(new EmailRuleMatch(
            new EmailRule { EmailRuleId = 9, Name = "Cargos del banco", Action = EmailRuleAction.AssignLabel },
            new EmailLabel
            {
                LabelId = labelId,
                Name = name,
                Slug = name.ToLowerInvariant(),
                Behavior = EmailLabelBehavior.Expense,
                Active = true
            }));

    private static EmailClassifierOptions ClassifierOptions(bool fallbackEnabled = false, int maxPerRun = 20) =>
        new() { DropOlderThanDays = 0, LlmFallbackEnabled = fallbackEnabled, LlmMaxPerRun = maxPerRun };

    private static EmailLlmClassificationService Wrapper(
        IEmailClassificationService deterministic,
        IEmailLlmClassifier classifier,
        FakeLabelService labels,
        EmailClassifierOptions? options = null) => new(
        deterministic,
        classifier,
        labels,
        Options.Create(options ?? ClassifierOptions()),
        NullLogger<EmailLlmClassificationService>.Instance);

    // ---------- Rama: solo lo que pidió la regla ----------

    [Fact]
    public async Task An_explicit_llm_rule_reaches_the_model_even_when_the_fallback_is_off()
    {
        // El respaldo automático de no_match está apagado: una regla que pide el LLM no depende de
        // ese interruptor, porque el usuario lo pidió para ese correo.
        var deterministic = new FakeClassification { Map = _ => LlmRequested() };
        var classifier = new FakeClassifier
        {
            Decide = _ => new EmailLlmDecision(42, EmailLlmReasons.Model)
        };
        var labels = new FakeLabelService();
        labels.Add(Label(42, "Eliminar", EmailLabelBehavior.Ignore, description: "Correo que descarto."));
        labels.Add(Label(7, "Gastos", EmailLabelBehavior.Expense, active: false));

        var result = await Wrapper(deterministic, classifier, labels, ClassifierOptions(fallbackEnabled: false))
            .ClassifyAsync(OwnerId, Mail(), new EmailClassificationRunBudget(20), CancellationToken.None);

        // La elección del modelo es terminal y conserva la regla que la pidió.
        Assert.Equal(EmailClassificationOutcome.Ignored, result.Outcome);
        Assert.Equal(42, result.LabelId);
        Assert.Equal("eliminar", result.LabelSlug);
        Assert.Equal(EmailLabelBehavior.Ignore, result.LabelBehavior);
        Assert.Equal(EmailClassificationSource.Llm, result.ClassifiedBy);
        Assert.Equal("llm", result.Reason);
        Assert.Equal(5, result.MatchedRuleId);
        Assert.Equal("Revisar con LLM", result.MatchedRuleName);
        Assert.Equal(EmailMessageState.Ignored, result.ProjectedState);

        // El determinista corre primero y una sola vez; el modelo, una sola vez.
        Assert.Equal(1, deterministic.Calls);
        Assert.Equal(1, classifier.Calls);

        // Al modelo solo viajan las etiquetas ACTIVAS del dueño, con id, nombre y descripción.
        var request = Assert.Single(classifier.Requests);
        var only = Assert.Single(request.Labels);
        Assert.Equal(42, only.LabelId);
        Assert.Equal("Eliminar", only.Name);
        Assert.Equal("Correo que descarto.", only.Description);
        Assert.DoesNotContain(request.Labels, label => label.LabelId == 7);
        Assert.All(labels.ActiveFlags, onlyActive => Assert.True(onlyActive));
        Assert.All(labels.RequestedUserIds, id => Assert.Equal(OwnerId, id));
    }

    [Fact]
    public async Task A_rule_that_asks_for_review_never_reaches_the_model()
    {
        var deterministic = new FakeClassification { Map = _ => RuleReview() };
        var classifier = new FakeClassifier();
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        var result = await Wrapper(deterministic, classifier, labels)
            .ClassifyAsync(OwnerId, Mail(), new EmailClassificationRunBudget(20), CancellationToken.None);

        // Revisión por regla, sin modelo: el presupuesto ni se toca.
        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Equal("rule_review", result.Reason);
        Assert.Equal(EmailClassificationSource.Rule, result.ClassifiedBy);
        Assert.Equal(6, result.MatchedRuleId);
        Assert.Equal("Revisar facturas", result.MatchedRuleName);
        Assert.Equal(0, classifier.Calls);
        Assert.Empty(labels.ActiveFlags);
    }

    [Fact]
    public async Task An_assigned_label_is_terminal_and_never_calls_the_model()
    {
        var deterministic = new FakeClassification { Map = _ => Assigned() };
        var classifier = new FakeClassifier();
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        var result = await Wrapper(deterministic, classifier, labels)
            .ClassifyAsync(OwnerId, Mail(), new EmailClassificationRunBudget(20), CancellationToken.None);

        // Comportamiento previo que se conserva: la asignación de la regla sigue intacta.
        Assert.Equal(EmailClassificationOutcome.Expense, result.Outcome);
        Assert.Equal(7, result.LabelId);
        Assert.Equal("gastos", result.LabelSlug);
        Assert.Equal(EmailClassificationSource.Rule, result.ClassifiedBy);
        Assert.Equal("rule", result.Reason);
        Assert.Equal(1, deterministic.Calls);
        Assert.Equal(0, classifier.Calls);
    }

    // ---------- Respaldo opcional de no_match ----------

    [Fact]
    public async Task No_match_without_the_fallback_never_calls_the_model()
    {
        var deterministic = new FakeClassification { Map = _ => EmailClassificationResult.Review() };
        var classifier = new FakeClassifier { Decide = _ => new EmailLlmDecision(7, EmailLlmReasons.Model) };
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        var result = await Wrapper(deterministic, classifier, labels, ClassifierOptions(fallbackEnabled: false))
            .ClassifyAsync(OwnerId, Mail(), new EmailClassificationRunBudget(20), CancellationToken.None);

        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Equal("no_match", result.Reason);
        Assert.Equal(EmailClassificationSource.None, result.ClassifiedBy);
        Assert.Null(result.MatchedRuleId);
        Assert.Equal(0, classifier.Calls);
        Assert.Empty(labels.ActiveFlags);
    }

    [Fact]
    public async Task No_match_with_the_fallback_enabled_lets_the_model_choose_an_active_label()
    {
        var deterministic = new FakeClassification { Map = _ => EmailClassificationResult.Review() };
        var classifier = new FakeClassifier { Decide = _ => new EmailLlmDecision(7, EmailLlmReasons.Model) };
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        // El respaldo también respeta el presupuesto de la corrida: aquí hay un lugar y lo gasta.
        var budget = new EmailClassificationRunBudget(1);
        var result = await Wrapper(deterministic, classifier, labels, ClassifierOptions(fallbackEnabled: true))
            .ClassifyAsync(OwnerId, Mail(), budget, CancellationToken.None);

        Assert.Equal(0, budget.Remaining);
        Assert.Equal(EmailClassificationOutcome.Expense, result.Outcome);
        Assert.Equal(7, result.LabelId);
        Assert.Equal(EmailClassificationSource.Llm, result.ClassifiedBy);
        Assert.Equal("llm", result.Reason);
        // Sin regla no hay metadatos de regla que conservar.
        Assert.Null(result.MatchedRuleId);
        Assert.Null(result.MatchedRuleName);
        Assert.Equal(1, classifier.Calls);
    }

    // ---------- Fallas: revisión con la regla conservada ----------

    [Fact]
    public async Task A_failing_model_ends_in_review_without_falling_to_a_later_label()
    {
        var deterministic = new FakeClassification { Map = _ => LlmRequested() };
        var classifier = new FakeClassifier { Throw = new InvalidOperationException("proveedor caído") };
        var labels = new FakeLabelService();
        labels.Add(Label(42, "Eliminar", EmailLabelBehavior.Ignore));

        var budget = new EmailClassificationRunBudget(1);
        var result = await Wrapper(deterministic, classifier, labels)
            .ClassifyAsync(OwnerId, Mail(), budget, CancellationToken.None);

        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Null(result.LabelSlug);
        Assert.Equal(EmailLlmReviewReason.Unavailable, result.Reason);
        Assert.Equal(EmailClassificationSource.Rule, result.ClassifiedBy);
        Assert.Equal(5, result.MatchedRuleId);
        Assert.Equal("Revisar con LLM", result.MatchedRuleName);
        Assert.Equal(EmailMessageState.Review, result.ProjectedState);

        // Una sola llamada determinista: el modelo no se reintenta ni se busca otra etiqueta después.
        Assert.Equal(1, deterministic.Calls);
        Assert.Equal(1, classifier.Calls);

        // El intento se reserva antes de llamar, así que un error también consume presupuesto.
        Assert.Equal(0, budget.Remaining);
    }

    [Fact]
    public async Task A_label_outside_the_catalog_is_not_applied_and_ends_in_review()
    {
        var deterministic = new FakeClassification { Map = _ => LlmRequested() };
        // Defensa del orquestador: aunque el componente devolviera un id inventado, no se resuelve a
        // ninguna etiqueta. No se re-ejecuta el motor ni se devuelve la etiqueta de una regla posterior.
        var classifier = new FakeClassifier { Decide = _ => new EmailLlmDecision(999, EmailLlmReasons.Model) };
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        var result = await Wrapper(deterministic, classifier, labels)
            .ClassifyAsync(OwnerId, Mail(), new EmailClassificationRunBudget(20), CancellationToken.None);

        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Equal(EmailLlmReviewReason.Uncertain, result.Reason);
        Assert.Equal(5, result.MatchedRuleId);
        Assert.Equal(1, deterministic.Calls);
    }

    [Theory]
    [InlineData(EmailLlmReasons.Uncertain, EmailLlmReviewReason.Uncertain)]
    [InlineData(EmailLlmReasons.ResponseInvalid, EmailLlmReviewReason.Uncertain)]
    [InlineData(EmailLlmReasons.LabelNotInCatalog, EmailLlmReviewReason.Uncertain)]
    [InlineData(EmailLlmReasons.ProviderUnavailable, EmailLlmReviewReason.Unavailable)]
    [InlineData(EmailLlmReasons.CatalogInvalid, EmailLlmReviewReason.CatalogInvalid)]
    [InlineData(EmailLlmReasons.Error, EmailLlmReviewReason.Unavailable)]
    public async Task Model_review_reasons_map_to_the_fixed_review_reasons_of_the_api(
        string modelReason,
        string expected)
    {
        var deterministic = new FakeClassification { Map = _ => LlmRequested(ruleId: 3, name: "Regla LLM") };
        var classifier = new FakeClassifier { Decide = _ => EmailLlmDecision.Review(modelReason) };
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        var result = await Wrapper(deterministic, classifier, labels)
            .ClassifyAsync(OwnerId, Mail(), new EmailClassificationRunBudget(20), CancellationToken.None);

        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Equal(expected, result.Reason);
        Assert.Equal(3, result.MatchedRuleId);
        Assert.Equal("Regla LLM", result.MatchedRuleName);
    }

    [Fact]
    public async Task An_invalid_catalog_fails_to_review_without_spending_a_call()
    {
        var deterministic = new FakeClassification { Map = _ => LlmRequested() };
        var classifier = new FakeClassifier { Decide = _ => new EmailLlmDecision(7, EmailLlmReasons.Model) };
        var labels = new FakeLabelService();

        // Tope del componente: 200 etiquetas. Pasado el tope se falla cerrado en vez de truncar el
        // catálogo, porque truncar escondería etiquetas válidas del usuario.
        for (var id = 1; id <= 201; id++)
        {
            labels.Add(Label(id, $"Etiqueta {id}"));
        }

        var budget = new EmailClassificationRunBudget(1);
        var result = await Wrapper(deterministic, classifier, labels)
            .ClassifyAsync(OwnerId, Mail(), budget, CancellationToken.None);

        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Equal(EmailLlmReviewReason.CatalogInvalid, result.Reason);
        Assert.Equal(5, result.MatchedRuleId);
        Assert.Equal(0, classifier.Calls);
        Assert.Equal(1, budget.Remaining);
    }

    [Fact]
    public async Task An_empty_active_catalog_fails_to_review_without_spending_a_call()
    {
        var deterministic = new FakeClassification { Map = _ => LlmRequested() };
        var classifier = new FakeClassifier { Decide = _ => new EmailLlmDecision(7, EmailLlmReasons.Model) };
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Retirada", active: false));

        var result = await Wrapper(deterministic, classifier, labels)
            .ClassifyAsync(OwnerId, Mail(), new EmailClassificationRunBudget(20), CancellationToken.None);

        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Equal(EmailLlmReviewReason.CatalogInvalid, result.Reason);
        Assert.Equal(0, classifier.Calls);
    }

    // ---------- Presupuesto ----------

    [Fact]
    public async Task A_zero_budget_disables_every_model_call()
    {
        var deterministic = new FakeClassification { Map = _ => LlmRequested() };
        var classifier = new FakeClassifier { Decide = _ => new EmailLlmDecision(7, EmailLlmReasons.Model) };
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        var result = await Wrapper(deterministic, classifier, labels)
            .ClassifyAsync(OwnerId, Mail(), new EmailClassificationRunBudget(0), CancellationToken.None);

        Assert.Equal(EmailClassificationOutcome.Review, result.Outcome);
        Assert.Null(result.LabelId);
        Assert.Equal(EmailLlmReviewReason.BudgetExhausted, result.Reason);
        Assert.Equal(5, result.MatchedRuleId);
        Assert.Equal(0, classifier.Calls);
        Assert.Empty(labels.ActiveFlags);
    }

    [Fact]
    public void The_run_budget_clamps_its_bound_and_reserves_atomically()
    {
        // Cero apaga; el tope duro es 200 aunque la configuración pida más.
        Assert.Equal(0, new EmailClassificationRunBudget(-5).MaxCalls);
        Assert.Equal(0, new EmailClassificationRunBudget(0).MaxCalls);
        Assert.Equal(EmailClassificationRunBudget.DefaultMaxCalls, new EmailClassificationRunBudget(20).MaxCalls);
        Assert.Equal(EmailClassificationRunBudget.HardMaxCalls, new EmailClassificationRunBudget(9_999).MaxCalls);

        var budget = new EmailClassificationRunBudget(5);
        var reserved = 0;
        Parallel.For(0, 64, _ =>
        {
            if (budget.TryReserve())
            {
                Interlocked.Increment(ref reserved);
            }
        });

        // Reservas concurrentes sobre el mismo presupuesto: ni una de más.
        Assert.Equal(5, Volatile.Read(ref reserved));
        Assert.Equal(0, budget.Remaining);
        Assert.False(budget.TryReserve());
    }

    [Fact]
    public async Task Caller_cancellation_propagates_and_still_consumes_the_attempt()
    {
        var deterministic = new FakeClassification { Map = _ => LlmRequested() };
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        var classifier = new FakeClassifier { Throw = new OperationCanceledException(cancellation.Token) };
        var budget = new EmailClassificationRunBudget(20);

        await Assert.ThrowsAsync<OperationCanceledException>(() => Wrapper(deterministic, classifier, labels)
            .ClassifyAsync(OwnerId, Mail(), budget, cancellation.Token));

        Assert.Equal(19, budget.Remaining);
    }

    // ---------- Integración con la vista previa y el pase diario ----------

    [Fact]
    public async Task Preview_uses_one_budget_for_the_whole_sample()
    {
        var deterministic = new FakeClassification { Map = _ => LlmRequested() };
        var classifier = new FakeClassifier { Decide = _ => new EmailLlmDecision(7, EmailLlmReasons.Model) };
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        var options = ClassifierOptions(maxPerRun: 1);
        var service = PreviewService(deterministic, classifier, labels, options);

        var response = await service.PreviewAsync(OwnerId, Sample(), CancellationToken.None);

        Assert.Equal(2, response.Returned);

        // Primer mensaje: el modelo decide. Segundo: el presupuesto de la corrida ya se gastó, así que
        // va a revisión. Si el presupuesto se construyera por mensaje, ambos llamarían al modelo.
        Assert.Equal("llm", response.Rows[0].Reason);
        Assert.Equal("gastos", response.Rows[0].LabelSlug);
        Assert.Equal(EmailClassificationSource.Llm, response.Rows[0].ClassifiedBy);

        Assert.Equal(EmailLlmReviewReason.BudgetExhausted, response.Rows[1].Reason);
        Assert.Null(response.Rows[1].LabelSlug);
        Assert.Equal(EmailClassificationSource.Rule, response.Rows[1].ClassifiedBy);
        Assert.Equal(1, classifier.Calls);
        Assert.Equal(2, deterministic.Calls);

        // Sin buzón no hay plan: la vista previa con candidatos a mano no se aplica.
        Assert.Null(response.ApplyToken);
        Assert.Equal(0, response.ApplicableCount);
    }

    [Fact]
    public async Task The_daily_job_uses_one_budget_for_the_whole_pass()
    {
        var deterministic = new FakeClassification { Map = _ => LlmRequested() };
        var classifier = new FakeClassifier { Decide = _ => new EmailLlmDecision(7, EmailLlmReasons.Model) };
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        var source = new FakeDailySource();
        source.Folders.Add(new ImapTargetFolder("Gastos", FolderAttributes.None));
        source.Messages.Add(DailyMessage(10, "Compra uno"));
        source.Messages.Add(DailyMessage(11, "Compra dos"));

        var applier = new FakeApplier();
        var options = ClassifierOptions(maxPerRun: 1);
        var runner = Runner(deterministic, classifier, labels, source, applier, options);

        var result = await runner.RunAsync(OwnerId, CancellationToken.None);

        Assert.True(result.Executed);
        Assert.Equal(2, result.Scanned);
        Assert.Equal(1, result.Planned);
        Assert.Equal(1, result.Applied);

        var plan = Assert.Single(applier.Plans);
        var item = Assert.Single(plan.Items);
        Assert.Equal("Gastos", item.LabelName);
        Assert.Equal(10u, item.Uid);

        // Un solo presupuesto para toda la pasada, no uno por mensaje.
        Assert.Equal(1, classifier.Calls);
        Assert.Equal(2, deterministic.Calls);
    }

    [Fact]
    public async Task The_daily_job_never_writes_a_label_for_a_terminal_review()
    {
        var deterministic = new FakeClassification { Map = _ => RuleReview() };
        var classifier = new FakeClassifier { Decide = _ => new EmailLlmDecision(7, EmailLlmReasons.Model) };
        var labels = new FakeLabelService();
        labels.Add(Label(7, "Gastos"));

        var source = new FakeDailySource();
        source.Folders.Add(new ImapTargetFolder("Gastos", FolderAttributes.None));
        source.Messages.Add(DailyMessage(10, "Compra"));

        var applier = new FakeApplier();
        var runner = Runner(deterministic, classifier, labels, source, applier, ClassifierOptions());

        var result = await runner.RunAsync(OwnerId, CancellationToken.None);

        // Revisión terminal: ni modelo ni plan. El correo queda intacto en el buzón.
        Assert.True(result.Executed);
        Assert.Equal(1, result.Scanned);
        Assert.Equal(0, result.Planned);
        Assert.Empty(applier.Plans);
        Assert.Equal(0, classifier.Calls);
    }

    // ---------- Helpers ----------

    private static EmailPreviewRequest Sample() => new()
    {
        Candidates = new List<EmailPreviewCandidateInput>
        {
            new() { Name = "uno", SenderAddress = "avisos@banco.com", Subject = "Cargo 1", ReceivedAt = ReceivedAt },
            new() { Name = "dos", SenderAddress = "avisos@banco.com", Subject = "Cargo 2", ReceivedAt = ReceivedAt }
        }
    };

    private static EmailPreviewService PreviewService(
        IEmailClassificationService deterministic,
        IEmailLlmClassifier classifier,
        FakeLabelService labels,
        EmailClassifierOptions options) => new(
        deterministic,
        new UnusedMailboxSource(),
        labels,
        new EmailApplyPlanStore(TimeProvider.System),
        Options.Create(options),
        new EmailLlmClassificationService(
            deterministic,
            classifier,
            labels,
            Options.Create(options),
            NullLogger<EmailLlmClassificationService>.Instance));

    private static EmailIngestRunner Runner(
        IEmailClassificationService deterministic,
        IEmailLlmClassifier classifier,
        FakeLabelService labels,
        FakeDailySource source,
        FakeApplier applier,
        EmailClassifierOptions options) => new(
        source,
        deterministic,
        labels,
        applier,
        new EmailIngestCursor(),
        Options.Create(new EmailIngestOptions { MaxMessages = 50 }),
        NullLogger<EmailIngestRunner>.Instance,
        new EmailLlmClassificationService(
            deterministic,
            classifier,
            labels,
            Options.Create(options),
            NullLogger<EmailLlmClassificationService>.Instance));

    private static ImapPreviewMessage DailyMessage(uint uid, string subject) => new(
        Mail(subject),
        uid,
        4242u,
        $"<{uid}@x>",
        "imap.gmail.com|993|ssl|usuario")
    {
        Labels = new[] { "\\Inbox" }
    };

    private sealed class FakeClassification : IEmailClassificationService
    {
        public Func<EmailMessageCandidate, EmailClassificationResult> Map { get; init; } =
            _ => EmailClassificationResult.Review();

        public int Calls { get; private set; }

        public Task<EmailClassificationResult> ClassifyAsync(
            int userId,
            EmailMessageCandidate candidate,
            CancellationToken cancellationToken = default)
        {
            Calls++;
            return Task.FromResult(Map(candidate));
        }
    }

    private sealed class FakeClassifier : IEmailLlmClassifier
    {
        public Func<EmailLlmRequest, EmailLlmDecision> Decide { get; init; } =
            _ => EmailLlmDecision.Review(EmailLlmReasons.Uncertain);

        /// <summary>Excepción que lanza la llamada al componente, para cubrir el fallo inesperado.</summary>
        public Exception? Throw { get; init; }

        public int Calls { get; private set; }

        public List<EmailLlmRequest> Requests { get; } = new();

        public Task<EmailLlmDecision> ClassifyAsync(EmailLlmRequest request, CancellationToken cancellationToken)
        {
            Calls++;
            Requests.Add(request);

            if (Throw is not null)
            {
                throw Throw;
            }

            return Task.FromResult(Decide(request));
        }
    }

    private sealed class FakeLabelService : IEmailLabelService
    {
        private readonly List<EmailLabel> _labels = new();

        public List<int> RequestedUserIds { get; } = new();

        public List<bool> ActiveFlags { get; } = new();

        public void Add(EmailLabel label) => _labels.Add(label);

        public Task<IEnumerable<EmailLabel>> GetByUserIdAsync(int userId, bool onlyActive = false)
        {
            RequestedUserIds.Add(userId);
            ActiveFlags.Add(onlyActive);

            IEnumerable<EmailLabel> result = onlyActive
                ? _labels.Where(label => label.Active)
                : _labels;

            return Task.FromResult(result);
        }

        public Task<EmailLabel?> GetByIdAsync(int id, int userId) =>
            throw new NotSupportedException();

        public Task<EmailLabel> CreateAsync(EmailLabel label, int userId) =>
            throw new NotSupportedException();

        public Task<EmailLabel?> UpdateAsync(int id, EmailLabel label, int userId) =>
            throw new NotSupportedException();

        public Task<bool> SetActiveAsync(int id, int userId, bool active) =>
            throw new NotSupportedException();

        public Task<int> EnsureDefaultsAsync(int userId) =>
            throw new NotSupportedException();
    }

    /// <summary>La muestra de estas pruebas no pide buzón: leerlo aquí sería un error del test.</summary>
    private sealed class UnusedMailboxSource : IImapMailboxSource
    {
        public bool IsConfigured => false;

        public Task<IReadOnlyList<string>> ListMailboxesAsync(CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<ImapPreviewResult> FetchAsync(ImapFetchRequest request, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }

    private sealed class FakeDailySource : IImapDailyMailboxSource
    {
        public bool IsConfigured => true;

        public List<ImapPreviewMessage> Messages { get; } = new();

        public List<ImapTargetFolder> Folders { get; } = new();

        public Task<ImapDailyFetchResult> FetchUnlabelledAsync(
            ImapDailyFetchRequest request,
            CancellationToken cancellationToken) => Task.FromResult(new ImapDailyFetchResult(
            "INBOX",
            4242u,
            "imap.gmail.com|993|ssl|usuario",
            Folders,
            Messages,
            Messages.Count == 0 ? null : Messages[^1].Uid,
            Messages.Count));
    }

    private sealed class FakeApplier : IImapLabelApplier
    {
        public List<EmailApplyPlan> Plans { get; } = new();

        public Task<ImapApplyResult> ApplyAsync(EmailApplyPlan plan, CancellationToken cancellationToken)
        {
            Plans.Add(plan);

            return Task.FromResult(new ImapApplyResult(plan.Items
                .Select(item => new ImapApplyRowOutcome(item.Name, item.LabelName, ImapApplyStatus.Applied, "ok"))
                .ToList()));
        }
    }
}
