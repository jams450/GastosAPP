using GastosApp.API.Configuration;
using GastosApp.API.Services.Email;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Jobs.Runners;

/// <summary>
/// Adaptador del pase diario de correo (S1/L5). Llama al mismo <see cref="IEmailIngestRunner"/> que
/// el worker, con el dueño de <c>Email:Ingest:UserId</c>: ni el usuario 1 ni Telegram.
/// <para>
/// No consulta <c>Email:Ingest:Enabled</c>: una corrida manual funciona con el horario apagado
/// (S3). Las protecciones reales del pase —sin dueño, sin IMAP configurado, buzón sin la extensión
/// de etiquetas— siguen intactas y se reportan como <c>skipped</c> con su código.
/// </para>
/// <para>
/// El cursor es singleton y en memoria, así que una corrida manual avanza el mismo cursor que la
/// automática: no hay dos ventanas de lectura y el siguiente pase diario no vuelve a empezar.
/// </para>
/// </summary>
public sealed class EmailIngestJobRunner : IJobRunner
{
    private readonly IEmailIngestRunner _runner;
    private readonly EmailIngestOptions _options;
    private readonly ILogger<EmailIngestJobRunner> _logger;

    public EmailIngestJobRunner(
        IEmailIngestRunner runner,
        IOptions<EmailIngestOptions> options,
        ILogger<EmailIngestJobRunner> logger)
    {
        _runner = runner;
        _options = options.Value;
        _logger = logger;
    }

    public string JobKey => JobKeys.EmailIngest;

    public async Task<JobRunOutcome> RunAsync(CancellationToken cancellationToken)
    {
        var result = await _runner.RunAsync(_options.UserId, cancellationToken);

        if (!result.Executed)
        {
            _logger.LogInformation("Email daily ingest skipped: {SkipCode}", result.SkipCode);
            return JobRunOutcome.Skipped(result.SkipCode ?? "not_executed");
        }

        // Solo conteos: nunca asuntos, remitentes, etiquetas ni credenciales.
        _logger.LogInformation(
            "Email daily ingest finished: {Scanned} scanned, {Planned} planned, {Applied} applied, {Skipped} skipped, {Failed} failed.",
            result.Scanned,
            result.Planned,
            result.Applied,
            result.Skipped,
            result.Failed);

        return result.Failed > 0
            ? JobRunOutcome.Partial(result.Applied, result.Failed)
            : JobRunOutcome.Succeeded(result.Applied);
    }
}
