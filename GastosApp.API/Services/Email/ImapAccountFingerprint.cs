using System.Security.Cryptography;
using System.Text;
using GastosApp.API.Configuration;

namespace GastosApp.API.Services.Email;

/// <summary>
/// Huella de la cuenta IMAP configurada: host, puerto, TLS y usuario. Sirve para atar un plan de
/// etiquetado a la cuenta que produjo la muestra, sin guardar ni registrar la contraseña.
/// <para>
/// Es un hash, no un dato reversible: se puede comparar y registrar sin exponer el usuario. El
/// usuario sí forma parte de la identidad porque dos buzones del mismo servidor son cuentas distintas.
/// </para>
/// </summary>
public static class ImapAccountFingerprint
{
    /// <summary>
    /// Huella estable de la cuenta. Nunca incluye <see cref="ImapOptions.Password"/>: la contraseña de
    /// aplicación no debe viajar a logs, tokens ni respuestas.
    /// </summary>
    public static string From(ImapOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        var material = string.Join('|',
            (options.Host ?? string.Empty).Trim().ToLowerInvariant(),
            options.Port.ToString(System.Globalization.CultureInfo.InvariantCulture),
            options.UseSsl ? "ssl" : "starttls",
            (options.Username ?? string.Empty).Trim().ToLowerInvariant());

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(material));
        return Convert.ToHexString(hash, 0, 16).ToLowerInvariant();
    }
}
