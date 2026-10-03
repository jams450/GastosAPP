namespace GastosApp.BusinessLogic.Models.Investments;

/// <summary>
/// Controlled institution catalog for V1. The institution is a code, never free text: the API
/// rejects anything outside this list and the database enforces the same list with a CHECK.
/// The catalog and the PostgreSQL CHECK keep this exact ordering and spelling.
/// </summary>
public static class InvestmentInstitutions
{
    public const string Revolut = "revolut";
    public const string Cetes = "cetes";
    public const string Nu = "nu";
    public const string Klar = "klar";
    public const string Finsus = "finsus";
    public const string Didi = "didi";
    public const string MercadoLibre = "mercado_libre";
    public const string Openbank = "openbank";
    public const string Mifel = "mifel";
    public const string Otra = "otra";

    public static readonly IReadOnlyList<string> AllowedCodes =
    [
        Revolut,
        Cetes,
        Nu,
        Klar,
        Finsus,
        Didi,
        MercadoLibre,
        Openbank,
        Mifel,
        Otra
    ];

    /// <summary>Human-readable label for a canonical code. Falls back to the raw value for legacy rows.</summary>
    public static string Label(string? code) => code switch
    {
        Revolut => "Revolut",
        Cetes => "CETES",
        Nu => "Nu",
        Klar => "Klar",
        Finsus => "Finsus",
        Didi => "DiDi",
        MercadoLibre => "Mercado Libre",
        Openbank => "Openbank",
        Mifel => "Mifel",
        Otra => "Otra",
        _ => code ?? string.Empty
    };

    public static bool IsAllowed(string? code) => code is not null && AllowedCodes.Contains(code, StringComparer.Ordinal);

    /// <summary>
    /// Normalizes caller input to the canonical lowercase code. Case, padding, spaces and hyphens are
    /// folded, but the value must still resolve to one of the ten catalog codes.
    /// </summary>
    public static string Normalize(string? value, string name = "Institution")
    {
        var candidate = (value ?? string.Empty).Trim().ToLowerInvariant().Replace(' ', '_').Replace('-', '_');
        if (!IsAllowed(candidate))
        {
            throw new ArgumentException($"{name} must be one of: {string.Join(", ", AllowedCodes)}.");
        }

        return candidate;
    }
}
