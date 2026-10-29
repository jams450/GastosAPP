using GastosApp.API.Services.Email;
using Xunit;

namespace GastosApp.Backend.Tests;

/// <summary>
/// El parser de cabeceras alimenta el módulo de prueba: si decodifica mal, la muestra miente. Los
/// tres casos que importan son el plegado, la codificación RFC 2047 y el remitente con nombre.
/// </summary>
public class EmailHeaderParserTests
{
    [Fact]
    public void Reads_folded_headers_and_decodes_adjacent_encoded_words()
    {
        // Un asunto de banco real: partido en dos palabras codificadas, con plegado entre ellas.
        const string raw =
            "From: Banco Ejemplo <notificaciones@bancoejemplo.com>\r\n" +
            "Subject: =?utf-8?B?Q2FyZ28gZGUg?=\r\n" +
            " =?utf-8?B?TWV4JDEyMy4wMA==?=\r\n" +
            "Date: Fri, 16 Oct 2026 10:00:00 -0600\r\n" +
            "\r\n" +
            "Cuerpo que el clasificador determinista no necesita.\r\n";

        var candidate = EmailHeaderParser.Parse(raw);

        Assert.NotNull(candidate);
        Assert.Equal("notificaciones@bancoejemplo.com", candidate!.SenderAddress);
        // Sin la regla del espacio adyacente quedaría "Cargo de  Mex$123.00", con dos espacios.
        Assert.Equal("Cargo de Mex$123.00", candidate.Subject);
        Assert.Equal("bancoejemplo.com", candidate.EffectiveSenderDomain);
        Assert.Equal(new DateTime(2026, 10, 16, 16, 0, 0, DateTimeKind.Utc), candidate.ReceivedAt);
    }

    [Fact]
    public void Keeps_the_date_when_the_weekday_is_not_english()
    {
        // "Lun" no es un día válido para la cultura invariante. Sin el reintento sin prefijo, la
        // fecha se perdería y el corte de antigüedad dejaría pasar correo viejo.
        var candidate = EmailHeaderParser.Parse("From: a@b.com\r\nDate: Lun, 16 Oct 2026 10:00:00 -0600\r\n\r\n");

        Assert.NotNull(candidate);
        Assert.Equal(new DateTime(2026, 10, 16, 16, 0, 0, DateTimeKind.Utc), candidate!.ReceivedAt);
    }

    [Fact]
    public void Decodes_quoted_printable_words_with_underscore_as_space()
    {
        const string raw = "From: a@b.com\r\nSubject: =?iso-8859-1?Q?Cargo_de_M=E9xico?=\r\n\r\n";

        var candidate = EmailHeaderParser.Parse(raw);

        Assert.NotNull(candidate);
        Assert.Equal("Cargo de México", candidate!.Subject);
    }

    [Fact]
    public void Returns_null_when_there_are_no_readable_headers()
    {
        // Texto plano que no es un mensaje: contarlo como "no casó ninguna regla" sería mentir.
        Assert.Null(EmailHeaderParser.Parse("esto no es un correo"));
        Assert.Null(EmailHeaderParser.Parse(string.Empty));
        Assert.Null(EmailHeaderParser.Parse(null));
    }

    [Fact]
    public void Keeps_a_from_with_a_display_name_and_no_address_as_null()
    {
        // "From: Banco" sin dirección no da remitente; el asunto sí, así que el mensaje se conserva.
        var candidate = EmailHeaderParser.Parse("From: Banco\r\nSubject: Cargo\r\n\r\n");

        Assert.NotNull(candidate);
        Assert.Null(candidate!.SenderAddress);
        Assert.Equal("Cargo", candidate.Subject);
    }
}
