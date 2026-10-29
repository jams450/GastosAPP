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
    /// Tope de anidamiento al evaluar grupos. La relación padre-hijo vive en la base, y una fila mal
    /// formada podría apuntar en círculo; sin tope eso no es un error, es un desbordamiento de pila
    /// que se lleva el proceso.
    /// </summary>
    private const int MaxGroupDepth = 10;

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
            if (MatchesRule(rule, candidate))
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

    /// <summary>
    /// Con grupos, mandan los grupos y las columnas <c>match_*</c> se ignoran. Mantener las dos fuentes
    /// activas dejaría dos verdades para la misma condición, que es justo lo que se está retirando.
    /// </summary>
    private static bool MatchesRule(EmailRule rule, EmailMessageCandidate candidate)
    {
        if (rule.Groups is { Count: > 0 })
        {
            var root = rule.Groups.FirstOrDefault(group => group.ParentGroupId is null);
            return root is not null && MatchesGroup(root, candidate, depth: 0);
        }

        return MatchesText(rule.MatchField, rule.MatchType, rule.MatchValue, candidate);
    }

    /// <summary>
    /// Un grupo combina con su operador a sus condiciones y a sus subgrupos. Un grupo sin nada
    /// devuelve falso: una regla a medio configurar no debe comportarse como comodín.
    /// </summary>
    private static bool MatchesGroup(EmailRuleGroup group, EmailMessageCandidate candidate, int depth)
    {
        if (depth > MaxGroupDepth)
        {
            return false;
        }

        var results = new List<bool>(group.Conditions.Count + group.Children.Count);

        foreach (var condition in group.Conditions)
        {
            results.Add(MatchesText(condition.MatchField, condition.MatchType, condition.MatchValue, candidate));
        }

        foreach (var child in group.Children)
        {
            results.Add(MatchesGroup(child, candidate, depth + 1));
        }

        if (results.Count == 0)
        {
            return false;
        }

        // Un combinador desconocido se trata como AND: ante la duda, la regla es más estricta, no más
        // laxa. Una errata no debe ampliar a qué correo se le aplica una etiqueta.
        var isOr = string.Equals(
            (group.Combinator ?? string.Empty).Trim(),
            EmailRuleGroupCombinator.Or,
            StringComparison.OrdinalIgnoreCase);

        return isOr ? results.Any(result => result) : results.All(result => result);
    }

    private static bool MatchesText(
        string? matchField,
        string? matchType,
        string? matchValue,
        EmailMessageCandidate candidate)
    {
        if (string.IsNullOrEmpty(matchValue))
        {
            return false;
        }

        var text = FieldText(matchField, candidate);
        if (text.Length == 0)
        {
            return false;
        }

        var type = (matchType ?? string.Empty).Trim().ToLowerInvariant();
        return type switch
        {
            EmailRuleMatchType.Contains => text.Contains(matchValue, StringComparison.Ordinal),
            EmailRuleMatchType.Exact => text.Equals(matchValue, StringComparison.Ordinal),
            EmailRuleMatchType.StartsWith => text.StartsWith(matchValue, StringComparison.Ordinal),
            EmailRuleMatchType.EndsWith => text.EndsWith(matchValue, StringComparison.Ordinal),
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
