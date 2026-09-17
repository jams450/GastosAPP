using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// Normalización canónica del texto usado por <c>catalog_rules</c> y por la descripción
    /// de un gasto: trim, minúsculas, sin diacríticos y con espacios colapsados.
    /// Solo aplica a valores nuevos; no recalcula nombres normalizados ya persistidos.
    /// </summary>
    public static class CatalogTextNormalizer
    {
        public static string Normalize(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return string.Empty;
            }

            var decomposed = value.Trim().Normalize(NormalizationForm.FormD);
            var builder = new StringBuilder(decomposed.Length);
            foreach (var character in decomposed)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
                {
                    builder.Append(character);
                }
            }

            var withoutDiacritics = builder.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
            return Regex.Replace(withoutDiacritics, @"\s+", " ").Trim();
        }
    }
}
