using GastosApp.BusinessLogic.Services;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Models.Email;

/// <summary>Regla que ganó y la etiqueta a la que rutea.</summary>
public sealed record EmailRuleMatch(EmailRule Rule, EmailLabel Label);

/// <summary>
/// Evaluación determinista de reglas sobre un correo. Función pura a propósito: no consulta la base
/// ni escribe nada, así que el módulo de prueba puede usarla con cero efectos y las pruebas corren
/// sin motor relacional.
/// </summary>
public static class EmailRuleEvaluator
{
    /// <summary>
    /// Primera regla que casa, en orden de prioridad (menor gana) y luego por id. Una regla inactiva
    /// nunca casa, y una regla cuya etiqueta destino esté inactiva se salta para que la siguiente
    /// pueda decidir: retirar una etiqueta no debe detener la clasificación de todo un remitente.
    /// <para>
    /// <see cref="EmailRule.MatchValue"/> se espera ya normalizado, igual que en <c>catalog_rules</c>:
    /// lo normaliza el servicio al escribir. Acá solo se normaliza el texto que llega del correo, para
    /// que un error de escritura se vea en vez de quedar tapado por una segunda normalización.
    /// </para>
    /// </summary>
    public static EmailRuleMatch? Match(IEnumerable<EmailRule> rules, EmailMessageCandidate candidate)
    {
        ArgumentNullException.ThrowIfNull(rules);
        ArgumentNullException.ThrowIfNull(candidate);

        foreach (var rule in rules
            .Where(rule => rule.Active && rule.TargetLabel is { Active: true })
            .OrderBy(rule => rule.Priority)
            .ThenBy(rule => rule.EmailRuleId))
        {
            if (Matches(rule, candidate))
            {
                return new EmailRuleMatch(rule, rule.TargetLabel);
            }
        }

        return null;
    }

    /// <summary>
    /// Corte por antigüedad. Cero o negativo desactiva el corte, que es como se pide "sin límite"
    /// sin inventar un valor centinela como <c>null</c> en configuración.
    /// </summary>
    public static bool IsWithinAgeLimit(DateTime receivedAt, DateTime now, int dropOlderThanDays)
    {
        if (dropOlderThanDays <= 0)
        {
            return true;
        }

        return receivedAt >= now.AddDays(-dropOlderThanDays);
    }

    private static bool Matches(EmailRule rule, EmailMessageCandidate candidate)
    {
        if (string.IsNullOrEmpty(rule.MatchValue))
        {
            return false;
        }

        var text = FieldText(rule.MatchField, candidate);
        if (text.Length == 0)
        {
            return false;
        }

        var matchType = (rule.MatchType ?? string.Empty).Trim().ToLowerInvariant();
        return matchType switch
        {
            EmailRuleMatchType.Contains => text.Contains(rule.MatchValue, StringComparison.Ordinal),
            EmailRuleMatchType.Exact => text.Equals(rule.MatchValue, StringComparison.Ordinal),
            EmailRuleMatchType.StartsWith => text.StartsWith(rule.MatchValue, StringComparison.Ordinal),
            EmailRuleMatchType.EndsWith => text.EndsWith(rule.MatchValue, StringComparison.Ordinal),
            _ => false
        };
    }

    /// <summary>
    /// Texto del campo comparado, normalizado con la misma función que usa <c>catalog_rules</c>.
    /// El dominio se compara literal, incluidos subdominios: un "es paypal" se expresa con
    /// <c>ends_with</c> o <c>contains</c>, no con una regla oculta de subdominios.
    /// </summary>
    private static string FieldText(string? matchField, EmailMessageCandidate candidate) =>
        (matchField ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            EmailRuleMatchField.Sender => CatalogTextNormalizer.Normalize(candidate.SenderAddress),
            EmailRuleMatchField.SenderDomain => CatalogTextNormalizer.Normalize(candidate.EffectiveSenderDomain),
            EmailRuleMatchField.Subject => CatalogTextNormalizer.Normalize(candidate.Subject),
            _ => string.Empty
        };
}
