using GastosApp.BusinessLogic.Services;
using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Models.Email;

/// <summary>
/// Regla que ganó y la etiqueta a la que rutea. <see cref="Label"/> es nulo cuando la regla tiene una
/// acción terminal (<c>review</c> o <c>llm</c>): esas acciones no nombran etiqueta, y guardar una
/// cualquiera para satisfacer la forma del registro haría que algo la aplicara sin que nadie lo pidiera.
/// </summary>
public sealed record EmailRuleMatch(EmailRule Rule, EmailLabel? Label);

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
    /// Resultado de una condición o de un grupo. Tres valores y no dos: <see cref="Invalid" /> es una
    /// condición que no se puede evaluar (campo o comparación desconocidos, valor vacío) o un grupo que
    /// no tiene nada válido que combinar, y esa distinción es la que impide que un <c>NO</c> convierta
    /// un error de configuración en «casa con todo».
    /// </summary>
    private enum Evaluation
    {
        Invalid,
        NoMatch,
        Match
    }

    /// <summary>
    /// Primera regla que casa, en orden de prioridad (menor gana) y luego por id. Una regla inactiva
    /// nunca casa.
    /// <para>
    /// La elegibilidad depende de la acción, no solo de la etiqueta: <c>assign_label</c> exige una
    /// etiqueta activa (retirar una etiqueta no debe detener la clasificación de todo un remitente, así
    /// que se salta y la siguiente regla decide), mientras que <c>review</c> y <c>llm</c> no tienen
    /// etiqueta y por eso no pueden saltarse por «no tener una». Una acción desconocida devuelve el
    /// match igual —nunca cae a la regla siguiente— y <see cref="EmailClassificationResult.FromMatch" />
    /// la resuelve como revisión.
    /// </para>
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
            .Where(rule => rule.Active)
            .OrderBy(rule => rule.Priority)
            .ThenBy(rule => rule.EmailRuleId))
        {
            if (!MatchesRule(rule, candidate))
            {
                continue;
            }

            var action = EmailRuleAction.Normalize(rule.Action);

            if (action == EmailRuleAction.AssignLabel)
            {
                // Sin etiqueta activa no hay destino que escribir: la regla no puede ganar.
                if (rule.TargetLabel is not { Active: true })
                {
                    continue;
                }

                return new EmailRuleMatch(rule, rule.TargetLabel);
            }

            // review, llm y cualquier acción desconocida son terminales: la evaluación se detiene acá.
            return new EmailRuleMatch(rule, null);
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
    /// Las columnas planas no tienen negación: son el modelo anterior y se evalúan tal cual.
    /// </summary>
    private static bool MatchesRule(EmailRule rule, EmailMessageCandidate candidate)
    {
        if (rule.Groups is { Count: > 0 })
        {
            var root = rule.Groups.FirstOrDefault(group => group.ParentGroupId is null);
            return root is not null && EvaluateGroup(root, candidate, depth: 0) == Evaluation.Match;
        }

        return EvaluateText(rule.MatchField, rule.MatchType, rule.MatchValue, candidate) == Evaluation.Match;
    }

    /// <summary>
    /// Un grupo combina con su operador a sus condiciones y a sus subgrupos, y luego aplica su propia
    /// negación al resultado combinado —nunca a cada hijo—.
    /// <para>
    /// Un grupo vacío, o con todo inválido, devuelve <see cref="Evaluation.Invalid" />: no casa y su
    /// negación tampoco lo enciende. Es lo que evita que un <c>NO</c> mal puesto convierta una regla a
    /// medio configurar en un comodín.
    /// </para>
    /// <para>
    /// Un hijo inválido dentro de un grupo con ramas válidas se combina como falso, sin propagar el
    /// error: <c>O(condición válida, subgrupo vacío)</c> sigue casando por la condición válida, que es
    /// el comportamiento que ya estaba probado. Y como el resultado del grupo solo se invierte cuando
    /// es válido, la negación de un subgrupo vacío no se vuelve verdadera.
    /// </para>
    /// </summary>
    private static Evaluation EvaluateGroup(EmailRuleGroup group, EmailMessageCandidate candidate, int depth)
    {
        if (depth > MaxGroupDepth)
        {
            return Evaluation.Invalid;
        }

        var results = new List<Evaluation>(group.Conditions.Count + group.Children.Count);

        foreach (var condition in group.Conditions)
        {
            var evaluation = EvaluateText(condition.MatchField, condition.MatchType, condition.MatchValue, candidate);
            results.Add(condition.Negated ? Negate(evaluation) : evaluation);
        }

        foreach (var child in group.Children)
        {
            // La negación del hijo la aplica el propio hijo al combinar su resultado. Aplicarla
            // también acá la invertiría dos veces y el «NO» quedaría sin efecto.
            results.Add(EvaluateGroup(child, candidate, depth + 1));
        }

        // Un combinador desconocido se trata como AND: ante la duda, la regla es más estricta, no más
        // laxa. Una errata no debe ampliar a qué correo se le aplica una etiqueta.
        var isOr = string.Equals(
            (group.Combinator ?? string.Empty).Trim(),
            EmailRuleGroupCombinator.Or,
            StringComparison.OrdinalIgnoreCase);

        var combined = Combine(results, isOr);
        return group.Negated ? Negate(combined) : combined;
    }

    /// <summary>
    /// Lógica de tres valores. Un <c>true</c> en un <c>O</c> decide sin importar lo inválido que sea el
    /// resto, y un <c>false</c> en un <c>Y</c> también; si no hay valor decisivo, lo inválido gana sobre
    /// «falso» para que la negación no pueda convertirlo en verdadero.
    /// </summary>
    private static Evaluation Combine(List<Evaluation> results, bool isOr)
    {
        if (results.Count == 0)
        {
            return Evaluation.Invalid;
        }

        if (isOr)
        {
            if (results.Contains(Evaluation.Match))
            {
                return Evaluation.Match;
            }

            return results.Contains(Evaluation.Invalid) ? Evaluation.Invalid : Evaluation.NoMatch;
        }

        if (results.Contains(Evaluation.NoMatch))
        {
            return Evaluation.NoMatch;
        }

        return results.Contains(Evaluation.Invalid) ? Evaluation.Invalid : Evaluation.Match;
    }

    /// <summary>
    /// Invierte solo un resultado evaluable. Lo inválido no se niega: <c>NO(inválido)</c> sigue siendo
    /// inválido, que es la diferencia entre «el correo no coincide» y «la regla no se puede evaluar».
    /// </summary>
    private static Evaluation Negate(Evaluation evaluation) => evaluation switch
    {
        Evaluation.Match => Evaluation.NoMatch,
        Evaluation.NoMatch => Evaluation.Match,
        _ => Evaluation.Invalid
    };

    /// <summary>
    /// Evalúa una condición. Un valor vacío o un campo/comparación desconocidos son
    /// <see cref="Evaluation.Invalid" /> y no se niegan; un texto ausente en el correo es
    /// <see cref="Evaluation.NoMatch" /> —la condición sí es válida, solo que no coincide— y por lo
    /// tanto un <c>NO</c> sí lo invierte. Esa distinción está probada en los dos sentidos.
    /// </summary>
    private static Evaluation EvaluateText(
        string? matchField,
        string? matchType,
        string? matchValue,
        EmailMessageCandidate candidate)
    {
        if (string.IsNullOrEmpty(matchValue) || !IsKnownField(matchField))
        {
            return Evaluation.Invalid;
        }

        var type = (matchType ?? string.Empty).Trim().ToLowerInvariant();
        if (type is not (EmailRuleMatchType.Contains
            or EmailRuleMatchType.Exact
            or EmailRuleMatchType.StartsWith
            or EmailRuleMatchType.EndsWith))
        {
            return Evaluation.Invalid;
        }

        var text = FieldText(matchField, candidate);
        if (text.Length == 0)
        {
            return Evaluation.NoMatch;
        }

        var matched = type switch
        {
            EmailRuleMatchType.Contains => text.Contains(matchValue, StringComparison.Ordinal),
            EmailRuleMatchType.Exact => text.Equals(matchValue, StringComparison.Ordinal),
            EmailRuleMatchType.StartsWith => text.StartsWith(matchValue, StringComparison.Ordinal),
            EmailRuleMatchType.EndsWith => text.EndsWith(matchValue, StringComparison.Ordinal),
            _ => false
        };

        return matched ? Evaluation.Match : Evaluation.NoMatch;
    }

    /// <summary>
    /// Texto del campo comparado, normalizado con la misma función que usa <c>catalog_rules</c>.
    /// El dominio se compara literal, incluidos subdominios: un "es paypal" se expresa con
    /// <c>ends_with</c> o <c>contains</c>, no con una regla oculta de subdominios.
    /// Un campo desconocido devuelve vacío, que el llamador distingue de un campo válido sin texto.
    /// </summary>
    private static string FieldText(string? matchField, EmailMessageCandidate candidate) =>
        (matchField ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            EmailRuleMatchField.Sender => CatalogTextNormalizer.Normalize(candidate.SenderAddress),
            EmailRuleMatchField.SenderDomain => CatalogTextNormalizer.Normalize(candidate.EffectiveSenderDomain),
            EmailRuleMatchField.Subject => CatalogTextNormalizer.Normalize(candidate.Subject),
            _ => string.Empty
        };

    /// <summary>
    /// Si el campo es uno de los tres comparables. Se consulta antes de comparar para que un campo
    /// desconocido sea inválido y no «un campo vacío», que con un <c>NO</c> sí casaría.
    /// </summary>
    private static bool IsKnownField(string? matchField) =>
        (matchField ?? string.Empty).Trim().ToLowerInvariant()
            is EmailRuleMatchField.Sender or EmailRuleMatchField.SenderDomain or EmailRuleMatchField.Subject;
}
