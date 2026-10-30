namespace GastosApp.API.Services.Email;

/// <summary>Resultado de una fila del plan, con el estado que ve la pantalla.</summary>
public sealed record ImapApplyRowOutcome(string Name, string Label, string Status, string Message);

/// <summary>
/// Resultado de aplicar un plan. Los tres conteos se derivan de las filas para que no puedan
/// contradecirlas.
/// </summary>
public sealed record ImapApplyResult(IReadOnlyList<ImapApplyRowOutcome> Rows)
{
    public int Applied => Rows.Count(row => row.Status == ImapApplyStatus.Applied);
    public int Skipped => Rows.Count(row => row.Status == ImapApplyStatus.Skipped);
    public int Failed => Rows.Count(row => row.Status == ImapApplyStatus.Failed);
}

/// <summary>
/// Escritura del plan sobre el buzón. Existe como interfaz para que el orquestador (token, conteos,
/// respuesta HTTP) se pruebe con un doble, sin abrir IMAP ni simular MailKit.
/// </summary>
public interface IImapLabelApplier
{
    /// <summary>
    /// Aplica el plan. Un rechazo previo a cualquier escritura se lanza como
    /// <see cref="EmailApplyRefusedException"/>; los fallos por fila se devuelven en el resultado.
    /// </summary>
    Task<ImapApplyResult> ApplyAsync(EmailApplyPlan plan, CancellationToken cancellationToken);
}
