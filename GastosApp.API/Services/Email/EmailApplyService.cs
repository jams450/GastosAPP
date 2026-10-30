using GastosApp.API.Models.EmailClassification;

namespace GastosApp.API.Services.Email;

/// <summary>
/// Orquesta el canje del token y la escritura del plan. No conoce MailKit: el cliente IMAP entra como
/// <see cref="IImapLabelApplier"/>, así que el token, los conteos y la respuesta se prueban sin red.
/// <para>
/// El token no autoriza a buscar correo de nuevo: solo repite el plan que la persona revisó. Un token
/// inválido, vencido o de otra sesión se rechaza antes de abrir el buzón.
/// </para>
/// </summary>
public sealed class EmailApplyService
{
    private readonly EmailApplyPlanStore _store;
    private readonly IImapLabelApplier _applier;
    private readonly ILogger<EmailApplyService> _logger;

    public EmailApplyService(
        EmailApplyPlanStore store,
        IImapLabelApplier applier,
        ILogger<EmailApplyService> logger)
    {
        _store = store;
        _applier = applier;
        _logger = logger;
    }

    public async Task<EmailApplyResponse> ApplyAsync(
        int userId,
        string? token,
        CancellationToken cancellationToken = default)
    {
        var take = _store.Take(token, userId);

        switch (take.Status)
        {
            case EmailApplyTakeStatus.Missing:
                throw new EmailApplyRefusedException(
                    EmailApplyRefusalCode.TokenInvalid,
                    "El token de aplicación no es válido o ya se usó. Vuelve a generar la muestra.");

            case EmailApplyTakeStatus.Expired:
                throw new EmailApplyRefusedException(
                    EmailApplyRefusalCode.TokenExpired,
                    "El token de aplicación venció (15 minutos). Vuelve a generar la muestra.");

            case EmailApplyTakeStatus.WrongUser:
                // Mismo mensaje que un token inexistente: un token ajeno no es asunto de esta sesión.
                throw new EmailApplyRefusedException(
                    EmailApplyRefusalCode.TokenForeign,
                    "El token de aplicación no es válido o ya se usó. Vuelve a generar la muestra.");
        }

        var plan = take.Plan!;

        // Un plan vacío no debería existir (no se emite token sin filas aplicables), pero si llegara
        // aquí no se abre el buzón para no escribir nada.
        var result = plan.Items.Count == 0
            ? new ImapApplyResult(Array.Empty<ImapApplyRowOutcome>())
            : await _applier.ApplyAsync(plan, cancellationToken);

        _logger.LogInformation(
            "Email apply finished: {Applied} applied, {Skipped} skipped, {Failed} failed",
            result.Applied,
            result.Skipped,
            result.Failed);

        return new EmailApplyResponse
        {
            Applied = result.Applied,
            Skipped = result.Skipped,
            Failed = result.Failed,
            Rows = result.Rows
                .Select(row => new EmailApplyRow
                {
                    Name = row.Name,
                    Label = row.Label,
                    Status = row.Status,
                    Message = row.Message
                })
                .ToList()
        };
    }
}
