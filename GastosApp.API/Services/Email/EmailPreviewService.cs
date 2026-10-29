using GastosApp.API.Models.EmailClassification;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Email;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Email;

/// <summary>
/// Módulo de prueba del clasificador. Es un dry run estricto: clasifica y devuelve veredictos, pero
/// no inserta nada en <c>email_messages</c> ni crea borradores. Si escribiera, cada ajuste de reglas
/// quemaría los <c>Message-ID</c> ya reclamados y el libro de mensajes reportaría como procesado
/// correo que nunca lo fue.
/// </summary>
public sealed class EmailPreviewService
{
    private const int DefaultMaxItems = 50;
    private const int HardMaxItems = 200;

    private readonly IEmailClassificationService _classification;
    private readonly IImapMailboxSource _imap;
    private readonly EmailClassifierOptions _options;

    public EmailPreviewService(
        IEmailClassificationService classification,
        IImapMailboxSource imap,
        IOptions<EmailClassifierOptions> options)
    {
        _classification = classification;
        _imap = imap;
        _options = options.Value;
    }

    public async Task<EmailPreviewResponse> PreviewAsync(
        int userId,
        EmailPreviewRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var response = new EmailPreviewResponse { DropOlderThanDays = _options.DropOlderThanDays };
        var maxItems = Math.Clamp(request.MaxItems ?? DefaultMaxItems, 1, HardMaxItems);
        var candidates = BuildCandidates(request, response);

        if (!string.IsNullOrWhiteSpace(request.Mailbox))
        {
            // La muestra pedida es el buzón, así que sus mensajes van primero. La lectura es de solo
            // lectura por contrato (ver ImapMailboxSource): el dry run no escribe ni en la base ni en
            // el correo del usuario.
            var remote = await _imap.FetchAsync(
                new ImapFetchRequest(request.Mailbox, maxItems, request.From, request.To),
                cancellationToken);

            candidates.InsertRange(
                0,
                remote.Select((candidate, index) => ($"{request.Mailbox}#{index + 1}", candidate)));
        }

        response.Total = candidates.Count;

        foreach (var (name, candidate) in candidates)
        {
            if (IsOutOfRange(candidate, request.From, request.To))
            {
                response.SkippedOutOfRange++;
                continue;
            }

            if (response.Rows.Count >= maxItems)
            {
                response.SkippedByLimit++;
                continue;
            }

            var result = await _classification.ClassifyAsync(userId, candidate, cancellationToken);
            response.Rows.Add(new EmailPreviewRow
            {
                Name = name,
                SenderAddress = candidate.SenderAddress,
                SenderDomain = candidate.EffectiveSenderDomain,
                Subject = candidate.Subject,
                ReceivedAt = candidate.ReceivedAt == default ? null : candidate.ReceivedAt,
                Outcome = result.Outcome.ToString().ToLowerInvariant(),
                LabelSlug = result.LabelSlug,
                LabelBehavior = result.LabelBehavior,
                MatchedRuleName = result.MatchedRuleName,
                ClassifiedBy = result.ClassifiedBy,
                Reason = result.Reason,
                ProjectedState = result.ProjectedState
            });
        }

        response.Returned = response.Rows.Count;
        return response;
    }

    private static List<(string Name, EmailMessageCandidate Candidate)> BuildCandidates(
        EmailPreviewRequest request,
        EmailPreviewResponse response)
    {
        var candidates = new List<(string Name, EmailMessageCandidate Candidate)>();

        foreach (var message in request.Messages ?? new List<EmailPreviewMessageInput>())
        {
            // Un mensaje sin cabeceras legibles se cuenta y se nombra, no se descarta en silencio:
            // un descarte mudo se lee como "no casó ninguna regla".
            var parsed = EmailHeaderParser.Parse(message.Raw);
            if (parsed is null)
            {
                response.Unreadable++;
                continue;
            }

            candidates.Add((string.IsNullOrWhiteSpace(message.Name) ? "message" : message.Name.Trim(), parsed));
        }

        foreach (var candidate in request.Candidates ?? new List<EmailPreviewCandidateInput>())
        {
            candidates.Add((
                string.IsNullOrWhiteSpace(candidate.Name) ? "candidate" : candidate.Name.Trim(),
                new EmailMessageCandidate(
                    candidate.SenderAddress,
                    candidate.SenderDomain,
                    candidate.Subject,
                    candidate.ReceivedAt ?? default,
                    candidate.BodyText)));
        }

        return candidates;
    }

    /// <summary>
    /// Un candidato sin fecha no se filtra por rango: no hay dato que comparar. Es la misma regla
    /// que el corte de antigüedad, y por la misma razón.
    /// </summary>
    private static bool IsOutOfRange(EmailMessageCandidate candidate, DateTime? from, DateTime? to)
    {
        if (candidate.ReceivedAt == default)
        {
            return false;
        }

        if (from.HasValue && candidate.ReceivedAt < from.Value)
        {
            return true;
        }

        return to.HasValue && candidate.ReceivedAt > to.Value;
    }
}
