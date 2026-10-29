namespace GastosApp.BusinessLogic.Models.Email;

/// <summary>
/// Lo mínimo que el clasificador necesita de un correo, ya extraído por la fuente. No es la entidad
/// persistida: esto se construye tanto desde un mensaje guardado como desde IMAP, y por eso no toca
/// la base de datos.
/// </summary>
public sealed record EmailMessageCandidate(
    string? SenderAddress,
    string? SenderDomain,
    string? Subject,
    DateTime ReceivedAt,
    string? BodyText = null)
{
    /// <summary>
    /// Dominio efectivo. Si la fuente no lo separó, se deriva de la dirección; el texto después del
    /// último <c>@</c> es el dominio completo, incluidos subdominios como <c>mail.paypal.com</c>.
    /// </summary>
    public string EffectiveSenderDomain
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(SenderDomain))
            {
                return SenderDomain!;
            }

            if (string.IsNullOrWhiteSpace(SenderAddress))
            {
                return string.Empty;
            }

            var at = SenderAddress.LastIndexOf('@');
            return at < 0 || at == SenderAddress.Length - 1
                ? string.Empty
                : SenderAddress[(at + 1)..];
        }
    }
}
