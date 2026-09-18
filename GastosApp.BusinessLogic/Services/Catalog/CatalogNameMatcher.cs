namespace GastosApp.BusinessLogic.Services.Catalog;

/// <summary>
/// Emparejamiento difuso de nombres de catálogo (cuentas, categorías, subcategorías, comercios).
/// Reutiliza <see cref="CatalogTextNormalizer"/> y no depende de librerías externas.
/// Cuando no hay una coincidencia confiable devuelve sugerencias para ofrecer alternativas.
/// </summary>
public static class CatalogNameMatcher
{
    /// <summary>Puntaje mínimo para resolver sin preguntar.</summary>
    public const double AutoMatchThreshold = 0.82;

    /// <summary>Ventaja mínima sobre el segundo candidato para resolver sin preguntar.</summary>
    public const double ClearLeadGap = 0.10;

    /// <summary>Máximo de alternativas devueltas cuando no hay coincidencia confiable.</summary>
    public const int MaxSuggestions = 5;

    /// <summary>Longitud mínima del texto más corto para aceptar prefijo/contención.</summary>
    private const int MinSharedLength = 3;

    public static CatalogMatch<T> Match<T>(string? input, IReadOnlyList<T> candidates, Func<T, string> nameSelector)
        where T : class
    {
        if (candidates.Count == 0)
        {
            return new CatalogMatch<T>(null, 0, Array.Empty<T>());
        }

        var normalizedInput = CatalogTextNormalizer.Normalize(input);

        // Sin texto utilizable solo se pueden ofrecer opciones, nunca autodeterminar.
        if (normalizedInput.Length == 0)
        {
            return new CatalogMatch<T>(null, 0, TopByName(candidates, nameSelector));
        }

        var scored = candidates
            .Select(candidate =>
            {
                var name = nameSelector(candidate);
                return new ScoredCandidate<T>(candidate, name, Score(normalizedInput, CatalogTextNormalizer.Normalize(name)));
            })
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var best = scored[0];
        var second = scored.Count > 1 ? scored[1].Score : 0d;

        var autoResolve = best.Score >= AutoMatchThreshold
            && (second < AutoMatchThreshold || best.Score - second >= ClearLeadGap);

        if (autoResolve)
        {
            return new CatalogMatch<T>(best.Candidate, best.Score, Array.Empty<T>());
        }

        // Confianza insuficiente o empate (p. ej. nombres duplicados): se ofrecen alternativas.
        return new CatalogMatch<T>(
            null,
            best.Score,
            scored.Take(MaxSuggestions).Select(item => item.Candidate).ToList());
    }

    private static IReadOnlyList<T> TopByName<T>(IReadOnlyList<T> candidates, Func<T, string> nameSelector)
        where T : class
        => candidates
            .Select(candidate => new ScoredCandidate<T>(candidate, nameSelector(candidate), 0))
            .OrderBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .Take(MaxSuggestions)
            .Select(item => item.Candidate)
            .ToList();

    private static double Score(string normalizedInput, string normalizedCandidate)
    {
        if (normalizedInput == normalizedCandidate) return 1.0;

        var inputIsShorter = normalizedInput.Length <= normalizedCandidate.Length;
        var shorter = inputIsShorter ? normalizedInput : normalizedCandidate;
        var longer = inputIsShorter ? normalizedCandidate : normalizedInput;

        if (shorter.Length >= MinSharedLength)
        {
            if (longer.StartsWith(shorter, StringComparison.Ordinal)) return 0.92;
            if (longer.Contains(shorter, StringComparison.Ordinal)) return 0.88;
        }

        return LevenshteinRatio(normalizedInput, normalizedCandidate);
    }

    private static double LevenshteinRatio(string first, string second)
    {
        var longest = Math.Max(first.Length, second.Length);
        if (longest == 0) return 1.0;

        return 1.0 - (double)LevenshteinDistance(first, second) / longest;
    }

    /// <summary>Distancia de Levenshtein estándar (programación dinámica, dos filas).</summary>
    private static int LevenshteinDistance(string first, string second)
    {
        if (first.Length == 0) return second.Length;
        if (second.Length == 0) return first.Length;

        var previous = new int[second.Length + 1];
        var current = new int[second.Length + 1];

        for (var j = 0; j <= second.Length; j++)
        {
            previous[j] = j;
        }

        for (var i = 1; i <= first.Length; i++)
        {
            current[0] = i;
            for (var j = 1; j <= second.Length; j++)
            {
                var cost = first[i - 1] == second[j - 1] ? 0 : 1;
                current[j] = Math.Min(
                    Math.Min(current[j - 1] + 1, previous[j] + 1),
                    previous[j - 1] + cost);
            }

            (previous, current) = (current, previous);
        }

        return previous[second.Length];
    }

    private sealed record ScoredCandidate<T>(T Candidate, string Name, double Score) where T : class;
}

/// <summary>Resultado del emparejamiento: el valor resuelto o las alternativas sugeridas.</summary>
public sealed record CatalogMatch<T>(T? Value, double Score, IReadOnlyList<T> Suggestions) where T : class;
