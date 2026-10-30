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
/// Aplicación de etiquetas sobre la MISMA muestra revisada (S12). Lo que se fija aquí son las reglas
/// que no se pueden romper sin darse cuenta:
/// <list type="bullet">
/// <item>la vista previa no escribe nada y entrega un plan inmutable;</item>
/// <item>el token es opaco, dura 15 minutos, es de un solo uso y de un solo dueño;</item>
/// <item>el plan conserva UID/UIDVALIDITY/Message-ID del buzón, y una identidad que cambió se rechaza
/// antes de escribir;</item>
/// <item>solo se escriben etiquetas de usuario existentes, por nombre exacto, nunca carpetas del
/// sistema como INBOX o [Gmail];</item>
/// <item>un mensaje sin Message-ID falla cerrado en lugar de etiquetarse a ciegas.</item>
/// <item>una fila que ya tiene la etiqueta destino de su propia regla no se muestra ni entra al plan.</item>
/// </list>
/// Ninguna prueba abre IMAP: la política es una función pura y el escritor se sustituye por un doble.
/// </summary>
public class EmailImapApplyTests
{
    private const int UserId = 7;

    // ---------- Vista previa: plan y token ----------

    [Fact]
    public async Task Preview_issues_a_token_for_remote_rows_with_a_label_only()
    {
        var clock = new FakeClock();
        var store = new EmailApplyPlanStore(clock);
        var imap = new FakeMailboxSource
        {
            Messages =
            {
                Message(uid: 10, messageId: "<a@x>", subject: "Compra"),
                Message(uid: 20, messageId: "<b@x>", subject: "Hola")
            }
        };
        var classification = new FakeClassification();
        classification.Map = candidate => candidate.Subject == "Compra"
            ? EmailClassificationResult.FromMatch(RuleMatch(1, "Gastos", EmailLabelBehavior.Expense))
            : EmailClassificationResult.Review();
        var service = PreviewService(imap, classification, Labels(), store);

        var response = await service.PreviewAsync(UserId, new EmailPreviewRequest { Mailbox = "INBOX" });

        Assert.Equal(1, response.ApplicableCount);
        Assert.NotNull(response.ApplyToken);
        // 32 bytes aleatorios en base64url: 43 caracteres y sin relleno.
        Assert.Equal(43, response.ApplyToken!.Length);
        Assert.DoesNotContain('=', response.ApplyToken);
        Assert.Equal(clock.GetUtcNow().Add(TimeSpan.FromMinutes(15)).UtcDateTime, response.ApplyExpiresAt);
    }

    [Fact]
    public async Task Manual_eml_and_candidate_rows_are_never_eligible_for_apply()
    {
        var store = new EmailApplyPlanStore(new FakeClock());
        var classification = new FakeClassification
        {
            Map = _ => EmailClassificationResult.FromMatch(RuleMatch(1, "Gastos", EmailLabelBehavior.Expense))
        };
        var service = PreviewService(new FakeMailboxSource(), classification, Labels(), store);

        var response = await service.PreviewAsync(UserId, new EmailPreviewRequest
        {
            Candidates = new List<EmailPreviewCandidateInput>
            {
                new() { Name = "mano", SenderAddress = "a@b.com", Subject = "Compra" }
            }
        });

        Assert.Equal(1, response.Returned);
        Assert.Null(response.ApplyToken);
        Assert.Equal(0, response.ApplicableCount);
    }

    [Fact]
    public async Task Preview_does_not_write_and_apply_replays_the_same_plan()
    {
        var clock = new FakeClock();
        var store = new EmailApplyPlanStore(clock);
        var imap = new FakeMailboxSource
        {
            Messages =
            {
                Message(uid: 10, messageId: "<a@x>", subject: "Compra"),
                Message(uid: 20, messageId: "<b@x>", subject: "Recibo")
            }
        };
        var classification = new FakeClassification { Map = _ => EmailClassificationResult.FromMatch(RuleMatch(1, "Gastos", EmailLabelBehavior.Expense)) };
        var applier = new FakeApplier();
        var service = PreviewService(imap, classification, Labels(), store);

        var preview = await service.PreviewAsync(UserId, new EmailPreviewRequest { Mailbox = "INBOX" });

        // La vista previa no escribe: el escritor no fue llamado ni una vez.
        Assert.Empty(applier.Plans);
        Assert.Equal(2, preview.ApplicableCount);

        var apply = new EmailApplyService(store, applier, NullLogger<EmailApplyService>.Instance);
        var result = await apply.ApplyAsync(UserId, preview.ApplyToken, CancellationToken.None);

        Assert.Equal(2, result.Applied);
        Assert.Equal(0, result.Failed);
        Assert.Equal(0, result.Skipped);

        var plan = Assert.Single(applier.Plans);
        Assert.Equal("INBOX", plan.Mailbox);
        Assert.Equal(4242u, plan.UidValidity);
        Assert.Equal(FakeMailboxSource.Fingerprint, plan.AccountFingerprint);
        Assert.Equal(new[] { 10u, 20u }, plan.Items.Select(item => item.Uid).ToArray());
        Assert.Equal(new[] { "<a@x>", "<b@x>" }, plan.Items.Select(item => item.MessageId).ToArray());
        Assert.All(plan.Items, item => Assert.Equal("Gastos", item.LabelName));
        Assert.All(plan.Items, item => Assert.Equal(4242u, item.UidValidity));
        Assert.Equal("applied", result.Rows[0].Status);
        Assert.Equal("Gastos", result.Rows[0].Label);
    }

    [Fact]
    public async Task Preserve_existing_preview_verdicts_for_manual_candidates()
    {
        var store = new EmailApplyPlanStore(new FakeClock());
        var classification = new FakeClassification
        {
            Map = _ => EmailClassificationResult.FromMatch(RuleMatch(1, "Gastos", EmailLabelBehavior.Expense))
        };
        var service = PreviewService(new FakeMailboxSource(), classification, Labels(), store);

        var response = await service.PreviewAsync(UserId, new EmailPreviewRequest
        {
            Candidates = new List<EmailPreviewCandidateInput> { new() { Name = "mano", Subject = "Compra" } }
        });

        // El veredicto previo sigue igual: nombre, resultado, etiqueta y estado proyectado.
        var row = Assert.Single(response.Rows);
        Assert.Equal("mano", row.Name);
        Assert.Equal("expense", row.Outcome);
        Assert.Equal("gastos", row.LabelSlug);
        Assert.Equal("rule", row.ClassifiedBy);
        Assert.Equal("drafted", row.ProjectedState);
        Assert.Equal(1, response.Total);
        Assert.Equal(1, response.Returned);
    }

    [Fact]
    public async Task A_row_that_already_has_its_target_label_is_hidden_and_leaves_no_plan()
    {
        var store = new EmailApplyPlanStore(new FakeClock());
        var imap = new FakeMailboxSource
        {
            Messages =
            {
                Message(uid: 10, messageId: "<a@x>", subject: "Compra", labels: new[] { "Gastos" })
            }
        };
        var classification = new FakeClassification
        {
            Map = _ => EmailClassificationResult.FromMatch(RuleMatch(1, "Gastos", EmailLabelBehavior.Expense))
        };
        var service = PreviewService(imap, classification, Labels(), store);

        var response = await service.PreviewAsync(UserId, new EmailPreviewRequest { Mailbox = "INBOX" });

        // La fila ya tiene la etiqueta destino de su regla: no se muestra, no se cuenta como aplicable
        // y no deja plan, porque aplicarlo solo repetiría lo que ya está hecho.
        Assert.Empty(response.Rows);
        Assert.Equal(1, response.Total);
        Assert.Equal(0, response.Returned);
        Assert.Equal(1, response.SkippedAlreadyLabelled);
        Assert.Equal(0, response.ApplicableCount);
        Assert.Null(response.ApplyToken);
        Assert.Null(response.ApplyExpiresAt);
    }

    [Fact]
    public async Task A_row_with_a_different_label_stays_visible_and_applicable()
    {
        var store = new EmailApplyPlanStore(new FakeClock());
        var imap = new FakeMailboxSource
        {
            Messages =
            {
                // Etiquetas de otros destinos y sellos del sistema: ninguno es la etiqueta destino de
                // la regla, así que la fila sigue siendo trabajo pendiente.
                Message(
                    uid: 10,
                    messageId: "<a@x>",
                    subject: "Compra",
                    labels: new[] { "Banco", "INBOX", "\\Inbox", "[Gmail]/All Mail" })
            }
        };
        var classification = new FakeClassification
        {
            Map = _ => EmailClassificationResult.FromMatch(RuleMatch(1, "Gastos", EmailLabelBehavior.Expense))
        };
        var service = PreviewService(imap, classification, Labels(), store);

        var response = await service.PreviewAsync(UserId, new EmailPreviewRequest { Mailbox = "INBOX" });

        var row = Assert.Single(response.Rows);
        Assert.Equal("INBOX#1", row.Name);
        Assert.Equal(0, response.SkippedAlreadyLabelled);
        Assert.Equal(1, response.ApplicableCount);
        Assert.NotNull(response.ApplyToken);
    }

    [Fact]
    public async Task Nested_label_names_match_the_full_name_exactly()
    {
        var store = new EmailApplyPlanStore(new FakeClock());
        var imap = new FakeMailboxSource
        {
            Messages =
            {
                Message(uid: 10, messageId: "<a@x>", subject: "Compra", labels: new[] { "Gastos/2026" }),
                Message(uid: 20, messageId: "<b@x>", subject: "Compra", labels: new[] { "Gastos" })
            }
        };
        var classification = new FakeClassification
        {
            Map = _ => EmailClassificationResult.FromMatch(RuleMatch(1, "Gastos/2026", EmailLabelBehavior.Expense))
        };
        var service = PreviewService(imap, classification, Labels("Gastos/2026"), store);

        var response = await service.PreviewAsync(UserId, new EmailPreviewRequest { Mailbox = "INBOX" });

        // Solo la fila que ya tiene «Gastos/2026» se descarta: la etiqueta padre «Gastos» no la
        // sustituye, porque el nombre completo se compara carácter por carácter.
        var row = Assert.Single(response.Rows);
        Assert.Equal("INBOX#2", row.Name);
        Assert.Equal(2, response.Total);
        Assert.Equal(1, response.Returned);
        Assert.Equal(1, response.SkippedAlreadyLabelled);
        Assert.Equal(1, response.ApplicableCount);
    }

    [Fact]
    public async Task Manual_content_is_never_hidden_by_the_label_rule()
    {
        var store = new EmailApplyPlanStore(new FakeClock());
        var classification = new FakeClassification
        {
            Map = _ => EmailClassificationResult.FromMatch(RuleMatch(1, "Gastos", EmailLabelBehavior.Expense))
        };
        var service = PreviewService(new FakeMailboxSource(), classification, Labels(), store);

        // Un candidato a mano no tiene etiquetas en el buzón: la regla de descarte no lo alcanza ni
        // cambia su veredicto.
        var response = await service.PreviewAsync(UserId, new EmailPreviewRequest
        {
            Candidates = new List<EmailPreviewCandidateInput>
            {
                new() { Name = "mano", SenderAddress = "a@b.com", Subject = "Compra" }
            }
        });

        var row = Assert.Single(response.Rows);
        Assert.Equal("mano", row.Name);
        Assert.Equal("expense", row.Outcome);
        Assert.Equal("gastos", row.LabelSlug);
        Assert.Equal(0, response.SkippedAlreadyLabelled);
        Assert.Equal(1, response.Returned);
        Assert.Null(response.ApplyToken);
    }

    [Fact]
    public async Task A_mailbox_without_label_support_keeps_its_rows()
    {
        var store = new EmailApplyPlanStore(new FakeClock());
        var imap = new FakeMailboxSource
        {
            // Sin GMailExt1 no hay resumen de etiquetas: la lista queda vacía y no se descarta nada.
            Messages = { Message(uid: 10, messageId: "<a@x>", subject: "Compra") }
        };
        var classification = new FakeClassification
        {
            Map = _ => EmailClassificationResult.FromMatch(RuleMatch(1, "Gastos", EmailLabelBehavior.Expense))
        };
        var service = PreviewService(imap, classification, Labels(), store);

        var response = await service.PreviewAsync(UserId, new EmailPreviewRequest { Mailbox = "INBOX" });

        Assert.Single(response.Rows);
        Assert.Equal(0, response.SkippedAlreadyLabelled);
        Assert.Equal(1, response.ApplicableCount);
        Assert.NotNull(response.ApplyToken);
    }

    // ---------- Token: dueño, uso único, caducidad, límite ----------

    [Fact]
    public async Task Token_is_single_use()
    {
        var clock = new FakeClock();
        var store = new EmailApplyPlanStore(clock);
        var token = store.Store(Plan()).Token;
        var applier = new FakeApplier();
        var service = new EmailApplyService(store, applier, NullLogger<EmailApplyService>.Instance);

        await service.ApplyAsync(UserId, token, CancellationToken.None);

        await Assert.ThrowsAsync<EmailApplyRefusedException>(
            () => service.ApplyAsync(UserId, token, CancellationToken.None));
        Assert.Single(applier.Plans);
    }

    [Fact]
    public async Task A_foreign_user_cannot_consume_the_token()
    {
        var store = new EmailApplyPlanStore(new FakeClock());
        var token = store.Store(Plan()).Token;
        var applier = new FakeApplier();
        var service = new EmailApplyService(store, applier, NullLogger<EmailApplyService>.Instance);

        await Assert.ThrowsAsync<EmailApplyRefusedException>(
            () => service.ApplyAsync(UserId + 1, token, CancellationToken.None));
        Assert.Empty(applier.Plans);

        // El rechazo no consumió el token: su dueño todavía puede usarlo.
        var result = await service.ApplyAsync(UserId, token, CancellationToken.None);

        Assert.Equal(1, result.Applied);
        Assert.Single(applier.Plans);
    }

    [Fact]
    public async Task Expired_token_is_refused_and_the_writer_is_never_called()
    {
        var clock = new FakeClock();
        var store = new EmailApplyPlanStore(clock);
        var token = store.Store(Plan()).Token;
        var applier = new FakeApplier();
        var service = new EmailApplyService(store, applier, NullLogger<EmailApplyService>.Instance);

        clock.Advance(TimeSpan.FromMinutes(16));

        await Assert.ThrowsAsync<EmailApplyRefusedException>(
            () => service.ApplyAsync(UserId, token, CancellationToken.None));
        Assert.Empty(applier.Plans);
    }

    [Fact]
    public async Task Tampered_or_empty_token_is_refused()
    {
        var store = new EmailApplyPlanStore(new FakeClock());
        var token = store.Store(Plan()).Token;
        var applier = new FakeApplier();
        var service = new EmailApplyService(store, applier, NullLogger<EmailApplyService>.Instance);

        await Assert.ThrowsAsync<EmailApplyRefusedException>(
            () => service.ApplyAsync(UserId, token[..^1] + (token[^1] == 'A' ? 'B' : 'A'), CancellationToken.None));
        await Assert.ThrowsAsync<EmailApplyRefusedException>(
            () => service.ApplyAsync(UserId, "   ", CancellationToken.None));
        await Assert.ThrowsAsync<EmailApplyRefusedException>(
            () => service.ApplyAsync(UserId, null, CancellationToken.None));
        Assert.Empty(applier.Plans);
    }

    [Fact]
    public void Pending_plans_are_capped_at_200()
    {
        var store = new EmailApplyPlanStore(new FakeClock());
        var tokens = Enumerable.Range(0, EmailApplyPlanStore.MaxPendingPlans + 1)
            .Select(_ => store.Store(Plan()).Token)
            .ToList();

        // El más viejo se descarta para que la memoria no crezca sin tope.
        Assert.Equal(EmailApplyTakeStatus.Missing, store.Take(tokens[0], UserId).Status);
        Assert.Equal(EmailApplyTakeStatus.Taken, store.Take(tokens[^1], UserId).Status);
    }

    // ---------- Identidad del buzón y del mensaje ----------

    [Fact]
    public void Changed_uidvalidity_refuses_the_whole_apply()
    {
        Assert.Null(ImapApplyPolicy.ValidateUidValidity(4242u, 4242u));
        Assert.NotNull(ImapApplyPolicy.ValidateUidValidity(4242u, 9999u));
    }

    [Fact]
    public void Changed_account_refuses_the_whole_apply()
    {
        Assert.Null(ImapApplyPolicy.ValidateAccount("host|993|ssl|user", "host|993|ssl|user"));
        Assert.NotNull(ImapApplyPolicy.ValidateAccount("host|993|ssl|user", "other|993|ssl|user"));
    }

    [Fact]
    public void A_message_without_message_id_fails_closed()
    {
        var decision = ImapApplyPolicy.Decide(
            Folder("Gastos"), "Gastos", expectedMessageId: " ", actualMessageId: "<a@x>", messageFound: true, alreadyLabelled: false);

        Assert.False(decision.Write);
        Assert.Equal(ImapApplyStatus.Failed, decision.Status);
    }

    [Fact]
    public void A_message_that_changed_since_the_preview_is_not_written()
    {
        var decision = ImapApplyPolicy.Decide(
            Folder("Gastos"), "Gastos", expectedMessageId: "<a@x>", actualMessageId: "<b@x>", messageFound: true, alreadyLabelled: false);

        Assert.False(decision.Write);
        Assert.Equal(ImapApplyStatus.Failed, decision.Status);
    }

    [Fact]
    public void A_message_that_is_no_longer_in_the_mailbox_is_not_written()
    {
        var decision = ImapApplyPolicy.Decide(
            Folder("Gastos"), "Gastos", expectedMessageId: "<a@x>", actualMessageId: null, messageFound: false, alreadyLabelled: false);

        Assert.False(decision.Write);
        Assert.Equal(ImapApplyStatus.Failed, decision.Status);
    }

    [Fact]
    public void A_matching_message_targeting_an_existing_user_label_is_written()
    {
        var decision = ImapApplyPolicy.Decide(
            Folder("Gastos"), "Gastos", expectedMessageId: "<a@x>", actualMessageId: "<a@x>", messageFound: true, alreadyLabelled: false);

        Assert.True(decision.Write);
        Assert.Equal(ImapApplyStatus.Applied, decision.Status);
    }

    [Fact]
    public void An_already_labelled_message_is_skipped_without_writing()
    {
        var decision = ImapApplyPolicy.Decide(
            Folder("Gastos"), "Gastos", expectedMessageId: "<a@x>", actualMessageId: "<a@x>", messageFound: true, alreadyLabelled: true);

        Assert.False(decision.Write);
        Assert.Equal(ImapApplyStatus.Skipped, decision.Status);
    }

    // ---------- Etiquetas: solo las de usuario, por nombre exacto ----------

    [Theory]
    [InlineData("Gastos", FolderAttributes.None)]
    [InlineData("Banco", FolderAttributes.None | FolderAttributes.HasNoChildren)]
    public void Existing_user_labels_are_valid_targets(string name, FolderAttributes attributes)
    {
        var target = ImapApplyPolicy.FindTarget(new[] { new ImapTargetFolder(name, attributes) }, name);

        Assert.NotNull(target);
        Assert.True(ImapApplyPolicy.IsUserLabel(target!));
    }

    [Theory]
    [InlineData("INBOX", FolderAttributes.Inbox)]
    [InlineData("[Gmail]", FolderAttributes.None)]
    [InlineData("[Gmail]/All Mail", FolderAttributes.All)]
    [InlineData("[Gmail]/Trash", FolderAttributes.Trash)]
    [InlineData("[Gmail]/Papelera", FolderAttributes.Trash)]
    [InlineData("Archivo", FolderAttributes.Archive)]
    [InlineData("Papelera", FolderAttributes.Trash)]
    [InlineData("Borradores", FolderAttributes.Drafts)]
    [InlineData("Enviados", FolderAttributes.Sent)]
    [InlineData("Spam", FolderAttributes.Junk)]
    [InlineData("Gastos", FolderAttributes.NoSelect)]
    [InlineData("Avisos", FolderAttributes.NonExistent)]
    public void System_nonselectable_and_archived_folders_are_never_targets(string name, FolderAttributes attributes)
    {
        var folder = new ImapTargetFolder(name, attributes);

        Assert.False(ImapApplyPolicy.IsUserLabel(folder));

        var decision = ImapApplyPolicy.Decide(folder, name, "<a@x>", "<a@x>", messageFound: true, alreadyLabelled: false);
        Assert.False(decision.Write);
        Assert.Equal(ImapApplyStatus.Skipped, decision.Status);
    }

    [Fact]
    public void A_missing_label_is_skipped_and_never_created()
    {
        var decision = ImapApplyPolicy.Decide(
            target: null, "Gastos/Nuevo", expectedMessageId: "<a@x>", actualMessageId: "<a@x>", messageFound: true, alreadyLabelled: false);

        Assert.False(decision.Write);
        Assert.Equal(ImapApplyStatus.Skipped, decision.Status);
        Assert.Contains("Gastos/Nuevo", decision.Message);
    }

    [Fact]
    public void Name_matching_is_exact_and_ordinal()
    {
        var folders = new[] { new ImapTargetFolder("Gastos", FolderAttributes.None), new ImapTargetFolder("Banco Gas", FolderAttributes.None) };

        Assert.Null(ImapApplyPolicy.FindTarget(folders, "gastos"));
        Assert.Null(ImapApplyPolicy.FindTarget(folders, "Banco"));
        Assert.NotNull(ImapApplyPolicy.FindTarget(folders, "Gastos"));
    }

    [Fact]
    public void Ignore_and_none_labels_are_applicable_but_review_is_not()
    {
        Assert.True(ImapApplyPolicy.IsEligible(EmailClassificationResult.FromMatch(RuleMatch(1, "Avisos", EmailLabelBehavior.Ignore))));
        Assert.True(ImapApplyPolicy.IsEligible(EmailClassificationResult.FromMatch(RuleMatch(1, "Otros", EmailLabelBehavior.None))));
        Assert.False(ImapApplyPolicy.IsEligible(EmailClassificationResult.Review()));
        Assert.False(ImapApplyPolicy.IsEligible(EmailClassificationResult.TooOld()));
    }

    // ---------- Helpers ----------

    private static EmailRuleMatch RuleMatch(int labelId, string name, string behavior) => new(
        new EmailRule { EmailRuleId = 1, Name = "regla" },
        new EmailLabel { LabelId = labelId, Name = name, Slug = name.ToLowerInvariant(), Behavior = behavior, Active = true });

    private static EmailApplyPlan Plan() => new(
        UserId,
        FakeMailboxSource.Fingerprint,
        "INBOX",
        4242u,
        new[] { new EmailApplyPlanItem("INBOX#1", 10u, 4242u, "<a@x>", "Gastos") });

    private static ImapPreviewMessage Message(uint uid, string? messageId, string subject, params string[] labels) => new(
        new EmailMessageCandidate("a@b.com", null, subject, DateTime.UtcNow.AddDays(-1)),
        uid,
        4242u,
        messageId,
        FakeMailboxSource.Fingerprint)
    {
        Labels = labels
    };

    private static ImapTargetFolder Folder(string name, FolderAttributes attributes = FolderAttributes.None) => new(name, attributes);

    private static EmailPreviewService PreviewService(
        IImapMailboxSource imap,
        IEmailClassificationService classification,
        IEmailLabelService labels,
        EmailApplyPlanStore store) => new(
        classification,
        imap,
        labels,
        store,
        Options.Create(new EmailClassifierOptions { DropOlderThanDays = 0 }));

    private static FakeLabelService Labels(string name = "Gastos") => new()
    {
        Labels =
        {
            new EmailLabel { LabelId = 1, Name = name, Slug = name.ToLowerInvariant(), Active = true, Behavior = EmailLabelBehavior.Expense }
        }
    };

    private sealed class FakeClock : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 10, 29, 12, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan delta) => _now = _now.Add(delta);
    }

    private sealed class FakeMailboxSource : IImapMailboxSource
    {
        public const string Fingerprint = "imap.gmail.com|993|ssl|usuario";

        public List<ImapPreviewMessage> Messages { get; } = new();

        public int FetchCalls { get; private set; }

        public bool IsConfigured => true;

        public Task<IReadOnlyList<string>> ListMailboxesAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<string>>(new[] { "INBOX", "Gastos" });

        public Task<ImapPreviewResult> FetchAsync(ImapFetchRequest request, CancellationToken cancellationToken)
        {
            FetchCalls++;
            return Task.FromResult(new ImapPreviewResult("INBOX", 4242u, Fingerprint, Messages.ToList()));
        }
    }

    private sealed class FakeClassification : IEmailClassificationService
    {
        public Func<EmailMessageCandidate, EmailClassificationResult> Map { get; set; } = _ => EmailClassificationResult.Review();

        public Task<EmailClassificationResult> ClassifyAsync(
            int userId,
            EmailMessageCandidate candidate,
            CancellationToken cancellationToken = default) => Task.FromResult(Map(candidate));
    }

    private sealed class FakeLabelService : IEmailLabelService
    {
        public List<EmailLabel> Labels { get; } = new();

        public Task<IEnumerable<EmailLabel>> GetByUserIdAsync(int userId, bool onlyActive = false) =>
            Task.FromResult<IEnumerable<EmailLabel>>(Labels);

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
