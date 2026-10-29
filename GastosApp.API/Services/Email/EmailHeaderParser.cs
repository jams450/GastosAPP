using System.Text;
using GastosApp.BusinessLogic.Models.Email;

namespace GastosApp.API.Services.Email;

/// <summary>
/// Lector de cabeceras de un mensaje RFC 822. Deliberadamente solo cabeceras: el clasificador
/// determinista decide por remitente, dominio y asunto, así que el cuerpo no se necesita para
/// probar reglas. Cuando llegue la fuente IMAP, el cuerpo lo entrega el cliente de correo.
/// </summary>
public static class EmailHeaderParser
{
    /// <summary>
    /// Devuelve el candidato o <c>null</c> si el texto no parece un mensaje con cabeceras.
    /// </summary>
    public static EmailMessageCandidate? Parse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var headers = ReadHeaderBlock(raw);
        if (headers.Count == 0)
        {
            return null;
        }

        var from = DecodeEncodedWords(headers.GetValueOrDefault("from"));
        var subject = DecodeEncodedWords(headers.GetValueOrDefault("subject"));
        var date = ParseDate(headers.GetValueOrDefault("date"));

        var address = ExtractAddress(from);
        if (string.IsNullOrWhiteSpace(address) && string.IsNullOrWhiteSpace(subject))
        {
            return null;
        }

        return new EmailMessageCandidate(address, null, subject, date);
    }

    /// <summary>
    /// Cabeceras del bloque inicial, con las líneas de continuación desplegadas. Las claves quedan
    /// en minúsculas porque RFC 822 no distingue mayúsculas en el nombre del campo.
    /// </summary>
    private static Dictionary<string, string> ReadHeaderBlock(string raw)
    {
        var headers = new Dictionary<string, string>(StringComparer.Ordinal);
        string? currentKey = null;
        var builder = new StringBuilder();

        foreach (var line in raw.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
        {
            if (line.Length == 0)
            {
                break;
            }

            // Continuación por plegado: empieza con espacio o tabulador.
            if (line[0] is ' ' or '\t')
            {
                if (currentKey != null)
                {
                    builder.Append(' ').Append(line.Trim());
                }

                continue;
            }

            Flush(headers, currentKey, builder);

            var colon = line.IndexOf(':');
            if (colon <= 0)
            {
                currentKey = null;
                continue;
            }

            currentKey = line[..colon].Trim().ToLowerInvariant();
            builder.Clear().Append(line[(colon + 1)..].Trim());
        }

        Flush(headers, currentKey, builder);
        return headers;
    }

    private static void Flush(Dictionary<string, string> headers, string? key, StringBuilder builder)
    {
        if (key != null && builder.Length > 0 && !headers.ContainsKey(key))
        {
            headers[key] = builder.ToString();
        }

        builder.Clear();
    }

    /// <summary>
    /// Extrae la dirección de un <c>From</c>: acepta <c>Nombre &lt;a@b&gt;</c> y <c>a@b (Nombre)</c>.
    /// </summary>
    public static string? ExtractAddress(string? from)
    {
        if (string.IsNullOrWhiteSpace(from))
        {
            return null;
        }

        var open = from.IndexOf('<');
        var close = from.IndexOf('>', open + 1);
        if (open >= 0 && close > open)
        {
            return from[(open + 1)..close].Trim();
        }

        var withoutComment = from.Trim();
        var parenthesis = withoutComment.IndexOf('(');
        if (parenthesis > 0)
        {
            withoutComment = withoutComment[..parenthesis];
        }

        withoutComment = withoutComment.Trim();
        return withoutComment.Contains('@') ? withoutComment : null;
    }

    /// <summary>
    /// Fecha de recepción. Un valor ilegible devuelve <see cref="DateTime.MinValue"/>, que el
    /// clasificador trata como "sin fecha" y no como "muy viejo".
    /// </summary>
    public static DateTime ParseDate(string? date)
    {
        if (string.IsNullOrWhiteSpace(date))
        {
            return default;
        }

        var text = NormalizeZone(StripTrailingComment(date.Trim()));

        if (TryParseOffset(text, out var parsed))
        {
            return parsed.UtcDateTime;
        }

        // El nombre del día no siempre es correcto ni está en inglés, y .NET rechaza la fecha entera
        // cuando no concuerda. Perder la fecha en silencio apagaría el corte de antigüedad, así que
        // se reintenta sin el prefijo del día.
        var comma = text.IndexOf(',');
        if (comma > 0 && TryParseOffset(text[(comma + 1)..].Trim(), out parsed))
        {
            return parsed.UtcDateTime;
        }

        return default;
    }

    private static bool TryParseOffset(string text, out DateTimeOffset parsed) =>
        DateTimeOffset.TryParse(
            text,
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AllowWhiteSpaces,
            out parsed);

    /// <summary>
    /// Convierte <c>-0600</c> en <c>-06:00</c>. RFC 5322 escribe el desfase sin dos puntos y
    /// <see cref="DateTimeOffset.TryParse(string?, IFormatProvider, DateTimeStyles, out DateTimeOffset)"/>
    /// con cultura invariante lo rechaza, así que sin esto toda fecha real llega vacía y el corte de
    /// antigüedad nunca se aplica.
    /// </summary>
    private static string NormalizeZone(string value)
    {
        if (value.Length < 5)
        {
            return value;
        }

        var tail = value[^5..];
        if (tail[0] is not ('+' or '-')
            || !char.IsAsciiDigit(tail[1]) || !char.IsAsciiDigit(tail[2])
            || !char.IsAsciiDigit(tail[3]) || !char.IsAsciiDigit(tail[4]))
        {
            return value;
        }

        return string.Concat(value[..^5], tail[..3], ":", tail[3..]);
    }

    /// <summary>
    /// Quita un comentario final como <c>(CST)</c>, que algunos remitentes agregan después del
    /// desfase y que también hace fallar el parser.
    /// </summary>
    private static string StripTrailingComment(string value)
    {
        if (value.Length == 0 || value[^1] != ')')
        {
            return value;
        }

        var open = value.LastIndexOf('(');
        return open > 0 ? value[..open].TrimEnd() : value;
    }

    /// <summary>
    /// Decodifica palabras codificadas RFC 2047 (<c>=?utf-8?B?...?=</c>). Los asuntos de banco
    /// llegan así muy seguido, y sin decodificar una regla de asunto nunca casaría.
    /// </summary>
    public static string? DecodeEncodedWords(string? value)
    {
        if (string.IsNullOrEmpty(value) || !value.Contains("=?", StringComparison.Ordinal))
        {
            return value;
        }

        var result = new StringBuilder();
        var index = 0;
        var decodedAny = false;

        while (index < value.Length)
        {
            var start = value.IndexOf("=?", index, StringComparison.Ordinal);
            if (start < 0)
            {
                result.Append(value[index..]);
                break;
            }

            // RFC 2047 §6.2: el espacio entre dos palabras codificadas adyacentes se ignora. Sin
            // esto, un asunto partido en dos queda con doble espacio y una regla de asunto que
            // debería casar termina no casando.
            var gap = value[index..start];
            if (!decodedAny || gap.Trim().Length > 0)
            {
                result.Append(gap);
            }

            // =?charset?encoding?text?=
            var charsetEnd = value.IndexOf('?', start + 2);
            var encodingEnd = charsetEnd < 0 ? -1 : value.IndexOf('?', charsetEnd + 1);
            var textEnd = encodingEnd < 0 ? -1 : value.IndexOf("?=", encodingEnd + 1, StringComparison.Ordinal);

            if (charsetEnd < 0 || encodingEnd < 0 || textEnd < 0)
            {
                result.Append(value[start..]);
                break;
            }

            var charset = value[(start + 2)..charsetEnd];
            var encoding = value[(charsetEnd + 1)..encodingEnd];
            var encodedText = value[(encodingEnd + 1)..textEnd];

            result.Append(DecodeWord(charset, encoding, encodedText));
            decodedAny = true;
            index = textEnd + 2;
        }

        return result.ToString();
    }

    private static string DecodeWord(string charset, string encoding, string text)
    {
        try
        {
            var bytes = encoding.ToUpperInvariant() switch
            {
                "B" => Convert.FromBase64String(PadBase64(text)),
                "Q" => DecodeQuotedPrintableWord(text),
                _ => null
            };

            if (bytes == null)
            {
                return text;
            }

            return ResolveEncoding(charset).GetString(bytes);
        }
        catch (FormatException)
        {
            // Una palabra mal formada no debe romper la clasificación de todo el mensaje.
            return text;
        }
    }

    /// <summary>
    /// En Q cada <c>_</c> es un espacio y los bytes no imprimibles vienen como <c>=XX</c>.
    /// </summary>
    private static byte[] DecodeQuotedPrintableWord(string text)
    {
        var bytes = new List<byte>(text.Length);

        for (var index = 0; index < text.Length; index++)
        {
            var current = text[index];
            if (current == '_')
            {
                bytes.Add((byte)' ');
                continue;
            }

            if (current == '=' && index + 2 < text.Length
                && Uri.IsHexDigit(text[index + 1]) && Uri.IsHexDigit(text[index + 2]))
            {
                bytes.Add(Convert.ToByte(text.Substring(index + 1, 2), 16));
                index += 2;
                continue;
            }

            bytes.AddRange(ResolveEncoding("utf-8").GetBytes(current.ToString()));
        }

        return bytes.ToArray();
    }

    private static string PadBase64(string text)
    {
        var remainder = text.Length % 4;
        return remainder == 0 ? text : text.PadRight(text.Length + (4 - remainder), '=');
    }

    /// <summary>
    /// Sin <c>System.Text.Encoding.CodePages</c> no hay Windows-1252; Latin-1 es lo suficientemente
    /// parecido para un asunto y evita agregar el paquete completo por un caso de borde.
    /// </summary>
    private static Encoding ResolveEncoding(string charset) =>
        charset.ToLowerInvariant() switch
        {
            "utf-8" or "utf8" => Encoding.UTF8,
            "us-ascii" or "ascii" => Encoding.ASCII,
            "iso-8859-1" or "latin1" or "windows-1252" or "cp1252" => Encoding.Latin1,
            _ => Encoding.UTF8
        };
}
