using GastosApp.API.BackgroundServices;
using GastosApp.API.Configuration;
using GastosApp.API.Services.Email;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Email;
using GastosApp.Models.Entities;
using MailKit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pase diario de etiquetado (S13/L28). Lo que se fija aquí es lo que no puede romperse en silencio:
/// <list type="bullet">
/// <item>el job espera la hora diaria y no corre al arrancar; sin dueño válido no hace nada;</item>
/// <item>el dueño sale solo de la configuración, nunca del usuario 1 ni de Telegram;</item>
/// <item>solo los correos de INBOX sin NINGUNA etiqueta de usuario y con etiqueta de catálogo
/// válida entran al plan; sin coincidencia o sin etiqueta existente no se toca nada;</item>
/// <item>el cursor rota y se reinicia cuando cambia la cuenta o el UIDVALIDITY, para no quedarse
/// sobre los mismos mensajes nuevos cuando no hay veredicto;</item>
/// <item>una fila que ganó una etiqueta entre la lectura y la escritura se omite antes de escribir;</item>
/// <item>un buzón sin la extensión de etiquetas de Gmail falla cerrado, sin pase alternativo.</item>
/// </list>
/// Ninguna prueba abre IMAP ni la base: la lectura diaria y la escritura son dobles.
/// </summary>
public class EmailIngestTests
{
    private const int OwnerId = 42;
    private const string Fingerprint = "imap.gmail.com|993|ssl|usuario";

    // ---------- Horario: espera, nunca arranque inmediato ----------

    [Fact]
    public void Schedule_waits_for_the_next_daily_slot_and_never_returns_zero()
    {
        // Justo en la hora objetivo la corrida de hoy ya pasó: toca mañana. Un cero aquí produce
        // un ciclo cerrado de escaneos.
        Assert.Equal(
            TimeSpan.FromDays(1),
            EmailIngestSchedule.DelayUntilNextRun(new DateTimeOffset(2026, 11, 2, 12, 0, 0, TimeSpan.Zero), 12));

        Assert.Equal(
            TimeSpan.FromHours(3),
            EmailIngestSchedule.DelayUntilNextRun(new DateTimeOffset(2026, 11, 2, 9, 0, 0, TimeSpan.Zero), 12));

        // Una hora fuera de rango se acota en vez de producir una espera negativa.
        Assert.Equal(
            TimeSpan.FromHours(1),
            EmailIngestSchedule.DelayUntilNextRun(new DateTimeOffset(2026, 11, 2, 22, 0, 0, TimeSpan.Zero), 99));
    }

    [Theory]
    [InlineData(false, OwnerId)]
    [InlineData(true, 0)]
    [InlineData(true, -5)]
    public async Task Disabled_or_ownerless_config_never_resolves_or_runs_the_pass(bool enabled, int userId)
    {
        var spy = new SpyRunner();
        var scopeFactory = ScopeFactoryFor(spy, out var resolutions);

        var service = new EmailIngestBackgroundService(
            scopeFactory,
            Options.Create(new EmailIngestOptions { Enabled = enabled, UserId = userId, HourUtc = 12 }),
            TimeProvider.System,
            NullLogger<EmailIngestBackgroundService>.Instance);

        await service.StartAsync(CancellationToken.None);
        await service.StopAsync(CancellationToken.None);

        Assert.Equal(0, spy.Calls);
        Assert.Equal(0, resolutions());
    }

    [Fact]
    public async Task Enabled_job_delays_before_the_first_run_instead_of_working_at_startup()
    {
        var spy = new SpyRunner();
        var scopeFactory = ScopeFactoryFor(spy, out _);

        var service = new EmailIngestBackgroundService(
            scopeFactory,
            Options.Create(new EmailIngestOptions { Enabled = true, UserId = OwnerId, HourUtc = 12 }),
            TimeProvider.System,
            NullLogger<EmailIngestBackgroundService>.Instance);

        await service.StartAsync(CancellationToken.None);
        await Task.Delay(150);
        Assert.Equal(0, spy.Calls);

        // Al cancelar, la espera se interrumpe de inmediato y el job no corre.
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await service.StopAsync(timeout.Token);
        Assert.Equal(0, spy.Calls);
    }

    // ---------- Alcance del pase y plan ----------

    [Fact]
    public async Task Pass_uses_only_the_configured_owner_and_plans_unlabelled_matches_with_an_existing_catalog_label()
    {
        var source = new FakeDailySource();
        source.Messages.AddRange(new[]
        {
            Message(10, "Compra unlabeled", "\\Inbox"),
            Message(11, "Compra con etiqueta de usuario", "\\Inbox", "Gastos"),
            Message(12, "Compra con etiqueta desconocida", "\\Inbox", "EtiquetaNueva"),
            Message(13, "Saludo sin regla", "\\Inbox"),
            Message(14, "Compra sin etiqueta de catálogo", "\\Inbox"),
            Message(15, "Compra con carpeta inexistente", "\\Inbox")
        });
        source.Folders.Add(new ImapTargetFolder("Gastos", FolderAttributes.None));

        var classification = new FakeClassification
        {
            Map = candidate => candidate.Subject switch
            {
                "Compra unlabeled" => Match(1, "Gastos"),
                "Compra sin etiqueta de catálogo" => Match(99, "Inexistente"),
                "Compra con carpeta inexistente" => Match(2, "Banco"),
                _ => EmailClassificationResult.Review()
            }
        };

        var labels = new FakeLabelService();
        labels.Labels.AddRange(new[]
        {
            new EmailLabel { LabelId = 1, Name = "Gastos", Slug = "gastos", Active = true, Behavior = EmailLabelBehavior.Expense },
            new EmailLabel { LabelId = 2, Name = "Banco", Slug = "banco", Active = true, Behavior = EmailLabelBehavior.Expense }
        });

        var applier = new FakeApplier();
        var cursor = new EmailIngestCursor();
        var runner = Runner(source, classification, labels, applier, cursor);

        var result = await runner.RunAsync(OwnerId, CancellationToken.None);

        Assert.True(result.Executed);
        Assert.Null(result.SkipCode);
        Assert.Equal(6, result.Scanned);
        Assert.Equal(1, result.Planned);
        Assert.Equal(1, result.Applied);
        Assert.Equal(0, result.Failed);

        // El dueño sale de la configuración y se propaga tal cual: ni el 1 implícito ni Telegram.
        Assert.All(classification.UserIds, id => Assert.Equal(OwnerId, id));
        Assert.All(labels.RequestedUserIds, id => Assert.Equal(OwnerId, id));

        var plan = Assert.Single(applier.Plans);
        Assert.Equal(OwnerId, plan.UserId);
        Assert.Equal("INBOX", plan.Mailbox);
        Assert.True(plan.RequireUnlabelled);
        Assert.Equal(new[] { 10u }, plan.Items.Select(item => item.Uid).ToArray());
        Assert.Equal("Gastos", Assert.Single(plan.Items).LabelName);

        // El cursor avanza con el último UID leído aunque haya filas sin veredicto.
        Assert.Equal(15u, cursor.Current.LastScannedUid);
        Assert.Equal(Fingerprint, cursor.Current.AccountFingerprint);
    }

    [Fact]
    public async Task A_pass_with_no_applicable_row_writes_nothing_but_still_advances_the_cursor()
    {
        var source = new FakeDailySource();
        source.Messages.Add(Message(30, "Saludo sin regla", "\\Inbox", "\\Important"));

        var classification = new FakeClassification
        {
            Map = _ => EmailClassificationResult.Review()
        };
        var applier = new FakeApplier();
        var cursor = new EmailIngestCursor();
        var runner = Runner(source, classification, new FakeLabelService(), applier, cursor);

        var result = await runner.RunAsync(OwnerId, CancellationToken.None);

        Assert.True(result.Executed);
        Assert.Equal(1, result.Scanned);
        Assert.Equal(0, result.Planned);
        Assert.Empty(applier.Plans);
        Assert.Equal(30u, cursor.Current.LastScannedUid);
    }

    [Fact]
    public async Task Not_configured_or_non_gmail_source_fails_closed_without_any_work()
    {
        var notConfigured = new FakeDailySource { IsConfigured = false };
        var classification = new FakeClassification();
        var labels = new FakeLabelService();
        var applier = new FakeApplier();

        var skipped = await Runner(notConfigured, classification, labels, applier)
            .RunAsync(OwnerId, CancellationToken.None);

        Assert.False(skipped.Executed);
        Assert.Equal(EmailIngestSkipCode.NotConfigured, skipped.SkipCode);
        Assert.Equal(0, notConfigured.Calls);

        var noGmail = new FakeDailySource
        {
            FailWith = new EmailApplyRefusedException(
                EmailApplyRefusalCode.MissingCapability,
                "El buzón no anuncia etiquetas de Gmail.")
        };

        var refused = await Runner(noGmail, classification, labels, applier)
            .RunAsync(OwnerId, CancellationToken.None);

        Assert.False(refused.Executed);
        Assert.Equal(EmailApplyRefusalCode.MissingCapability, refused.SkipCode);
        Assert.Equal(1, noGmail.Calls);
        Assert.Equal(0, classification.Calls);
        Assert.Equal(0, labels.Calls);
        Assert.Empty(applier.Plans);
    }

    // ---------- Cursor rotatorio ----------

    [Fact]
    public void Cursor_window_rotates_after_the_last_scanned_uid_and_wraps_only_once()
    {
        var uids = new uint[] { 10, 20, 30, 40, 50 };

        // Sin cursor empieza por el principio y respeta el tope.
        Assert.Equal(new uint[] { 10, 20 }, EmailIngestWindow.Select(uids, null, 2));
        Assert.Equal(new uint[] { 30, 40 }, EmailIngestWindow.Select(uids, 20, 2));

        // Al llegar al final da una sola vuelta y no repite UIDs.
        Assert.Equal(new uint[] { 30, 40, 50, 10, 20 }, EmailIngestWindow.Select(uids, 20, 10));

        // El tope duro es 200 por corrida, aunque la configuración pida más.
        var many = Enumerable.Range(1, 260).Select(value => (uint)value).ToArray();
        var bounded = EmailIngestWindow.Select(many, null, 1000);
        Assert.Equal(EmailIngestWindow.MaxScannedPerRun, bounded.Count);
        Assert.Equal(1u, bounded[0]);
        Assert.Equal((uint)EmailIngestWindow.MaxScannedPerRun, bounded[^1]);
    }

    [Fact]
    public void Cursor_resets_when_the_account_or_the_uidvalidity_changes()
    {
        var cursor = new EmailIngestCursor();

        cursor.Advance(Fingerprint, 4242u, 50u);
        Assert.Equal(50u, cursor.Current.LastScannedUid);

        // Misma identidad y sin ventana: se conserva lo avanzado.
        cursor.Advance(Fingerprint, 4242u, null);
        Assert.Equal(50u, cursor.Current.LastScannedUid);

        // Otra cuenta: el cursor viejo no nombra nada del buzón nuevo.
        cursor.Advance("otra-cuenta", 4242u, null);
        Assert.Null(cursor.Current.LastScannedUid);
        Assert.Equal("otra-cuenta", cursor.Current.AccountFingerprint);

        cursor.Advance("otra-cuenta", 4242u, 70u);
        Assert.Equal(70u, cursor.Current.LastScannedUid);

        // Mismo buzón reconstruido: los UID anteriores ya no valen.
        cursor.Advance("otra-cuenta", 9999u, null);
        Assert.Null(cursor.Current.LastScannedUid);
        Assert.Equal(9999u, cursor.Current.UidValidity);
    }

    // ---------- Etiquetas: sistema vs usuario, y la carrera ----------

    [Fact]
    public void Snapshot_verdict_ignores_system_labels_and_rejects_unknown_non_system_labels()
    {
        var userLabelNames = EmailIngestLabelPolicy.UserLabelNames(new[]
        {
            new ImapTargetFolder("Gastos", FolderAttributes.None),
            new ImapTargetFolder("INBOX", FolderAttributes.Inbox),
            new ImapTargetFolder("[Gmail]/All Mail", FolderAttributes.All)
        });

        Assert.Equal(
            EmailLabelSnapshotVerdict.NoUserLabel,
            EmailIngestLabelPolicy.Evaluate(
                new[] { "\\Inbox", "\\Important", "\\Read", "INBOX", "[Gmail]/All Mail" },
                userLabelNames));

        Assert.Equal(
            EmailLabelSnapshotVerdict.HasUserLabel,
            EmailIngestLabelPolicy.Evaluate(new[] { "\\Inbox", "Gastos" }, userLabelNames));

        Assert.Equal(
            EmailLabelSnapshotVerdict.UnknownLabel,
            EmailIngestLabelPolicy.Evaluate(new[] { "\\Inbox", "EtiquetaNueva" }, userLabelNames));

        // Sin instantánea no se puede confirmar la ausencia de etiquetas.
        Assert.Equal(
            EmailLabelSnapshotVerdict.UnknownLabel,
            EmailIngestLabelPolicy.Evaluate(null, userLabelNames));
    }

    [Fact]
    public void A_row_that_gained_a_user_label_between_read_and_write_is_skipped()
    {
        var target = new ImapTargetFolder("Gastos", FolderAttributes.None);

        var raced = ImapApplyPolicy.Decide(
            target,
            "Gastos",
            "<a@x>",
            "<a@x>",
            messageFound: true,
            alreadyLabelled: false,
            requireUnlabelled: true,
            snapshot: EmailLabelSnapshotVerdict.HasUserLabel);

        Assert.False(raced.Write);
        Assert.Equal(ImapApplyStatus.Skipped, raced.Status);

        var unknown = ImapApplyPolicy.Decide(
            target,
            "Gastos",
            "<a@x>",
            "<a@x>",
            messageFound: true,
            alreadyLabelled: false,
            requireUnlabelled: true,
            snapshot: EmailLabelSnapshotVerdict.UnknownLabel);

        Assert.False(unknown.Write);
        Assert.Equal(ImapApplyStatus.Skipped, unknown.Status);
    }

    [Fact]
    public void Manual_plan_keeps_its_old_behavior_when_the_unlabelled_flag_is_absent()
    {
        var plan = new EmailApplyPlan(
            OwnerId,
            Fingerprint,
            "INBOX",
            4242u,
            new[] { new EmailApplyPlanItem("INBOX#1", 10u, 4242u, "<a@x>", "Gastos") });

        Assert.False(plan.RequireUnlabelled);

        // El pase manual no exige ausencia de etiquetas: sigue escribiendo igual que antes.
        var decision = ImapApplyPolicy.Decide(
            new ImapTargetFolder("Gastos", FolderAttributes.None),
            "Gastos",
            "<a@x>",
            "<a@x>",
            messageFound: true,
            alreadyLabelled: false);

        Assert.True(decision.Write);
        Assert.Equal(ImapApplyStatus.Applied, decision.Status);
    }

    // ---------- Helpers ----------

    private static EmailIngestRunner Runner(
        FakeDailySource source,
        FakeClassification classification,
        FakeLabelService labels,
        FakeApplier applier,
        EmailIngestCursor? cursor = null) => new(
        source,
        classification,
        labels,
        applier,
        cursor ?? new EmailIngestCursor(),
        Options.Create(new EmailIngestOptions { MaxMessages = 50 }),
        NullLogger<EmailIngestRunner>.Instance);

    private static EmailClassificationResult Match(int labelId, string name) => EmailClassificationResult.FromMatch(new EmailRuleMatch(
        new EmailRule { EmailRuleId = 1, Name = "regla" },
        new EmailLabel { LabelId = labelId, Name = name, Slug = name.ToLowerInvariant(), Behavior = EmailLabelBehavior.Expense, Active = true }));

    private static ImapPreviewMessage Message(uint uid, string subject, params string[] labels) => new(
        new EmailMessageCandidate("banco@ejemplo.com", null, subject, DateTime.UtcNow.AddDays(-1)),
        uid,
        4242u,
        $"<{uid}@x>",
        Fingerprint)
    {
        Labels = labels
    };

    private static IServiceScopeFactory ScopeFactoryFor(SpyRunner spy, out Func<int> resolutions)
    {
        var services = new ServiceCollection();
        var count = 0;
        services.AddScoped<IEmailIngestRunner>(_ =>
        {
            Interlocked.Increment(ref count);
            return spy;
        });

        var provider = services.BuildServiceProvider();
        resolutions = () => Volatile.Read(ref count);
        return provider.GetRequiredService<IServiceScopeFactory>();
    }

    private sealed class SpyRunner : IEmailIngestRunner
    {
        public int Calls { get; private set; }

        public Task<EmailIngestRunResult> RunAsync(int userId, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(new EmailIngestRunResult(true, null, 0, 0, 0, 0, 0));
        }
    }

    private sealed class FakeDailySource : IImapDailyMailboxSource
    {
        public List<ImapPreviewMessage> Messages { get; } = new();

        public List<ImapTargetFolder> Folders { get; } = new();

        public Exception? FailWith { get; set; }

        public int Calls { get; private set; }

        public bool IsConfigured { get; set; } = true;

        public Task<ImapDailyFetchResult> FetchUnlabelledAsync(
            ImapDailyFetchRequest request,
            CancellationToken cancellationToken)
        {
            Calls++;

            if (FailWith is not null)
            {
                throw FailWith;
            }

            var ordered = Messages.OrderBy(message => message.Uid).ToList();
            var window = EmailIngestWindow.Select(ordered.Select(message => message.Uid).ToArray(), request.StartAfterUid, request.MaxMessages);
            var selected = ordered.Where(message => window.Contains(message.Uid)).ToList();

            return Task.FromResult(new ImapDailyFetchResult(
                "INBOX",
                4242u,
                Fingerprint,
                Folders.ToList(),
                selected,
                window.Count == 0 ? null : window[^1],
                ordered.Count));
        }
    }

    private sealed class FakeClassification : IEmailClassificationService
    {
        public Func<EmailMessageCandidate, EmailClassificationResult> Map { get; set; } =
            _ => EmailClassificationResult.Review();

        public List<int> UserIds { get; } = new();

        public int Calls => UserIds.Count;

        public Task<EmailClassificationResult> ClassifyAsync(
            int userId,
            EmailMessageCandidate candidate,
            CancellationToken cancellationToken = default)
        {
            UserIds.Add(userId);
            return Task.FromResult(Map(candidate));
        }
    }

    private sealed class FakeLabelService : IEmailLabelService
    {
        public List<EmailLabel> Labels { get; } = new();

        public List<int> RequestedUserIds { get; } = new();

        public int Calls => RequestedUserIds.Count;

        public Task<IEnumerable<EmailLabel>> GetByUserIdAsync(int userId, bool onlyActive = false)
        {
            RequestedUserIds.Add(userId);
            return Task.FromResult<IEnumerable<EmailLabel>>(Labels);
        }

        public Task<EmailLabel?> GetByIdAsync(int id, int userId) =>
            Task.FromResult(Labels.FirstOrDefault(label => label.LabelId == id));

        public Task<EmailLabel> CreateAsync(EmailLabel label, int userId) => throw new NotSupportedException();

        public Task<EmailLabel?> UpdateAsync(int id, EmailLabel label, int userId) => throw new NotSupportedException();

        public Task<bool> SetActiveAsync(int id, int userId, bool active) => throw new NotSupportedException();

        public Task<int> EnsureDefaultsAsync(int userId) => throw new NotSupportedException();
    }

    private sealed class FakeApplier : IImapLabelApplier
    {
        public List<EmailApplyPlan> Plans { get; } = new();

        public Task<ImapApplyResult> ApplyAsync(EmailApplyPlan plan, CancellationToken cancellationToken)
        {
            Plans.Add(plan);
            return Task.FromResult(new ImapApplyResult(plan.Items
                .Select(item => new ImapApplyRowOutcome(item.Name, item.LabelName, ImapApplyStatus.Applied, "Etiqueta aplicada."))
                .ToList()));
        }
    }
}
