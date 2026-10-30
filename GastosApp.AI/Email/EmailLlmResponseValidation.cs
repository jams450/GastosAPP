using System.Text.Json;

namespace GastosApp.AI.Email;

/// <summary>
/// Validación pura de la respuesta del modelo. Es pública para poder probarla sin red: el cliente
/// real es opaco, pero el contrato de la respuesta no lo es.
/// <para>
/// El modelo debe responder EXCLUSIVAMENTE <c>{"labelId":number|null,"uncertain":boolean}</c>. Un id
/// fuera del catálogo, una propiedad extra, un tipo distinto o un texto mayor a
/// <see cref="MaxResponseLength"/> se rechazan; nunca se «corrige» la respuesta para forzar una
/// etiqueta.
/// </para>
/// </summary>
public static class EmailLlmResponseValidation
{
    /// <summary>Máximo de etiquetas aceptadas en el catálogo. Más de 200 falla cerrado.</summary>
    public const int MaxLabels = 200;

    /// <summary>Largo máximo del nombre de una etiqueta, igual que la columna de la base.</summary>
    public const int MaxNameLength = 80;

    /// <summary>Largo máximo de la descripción de una etiqueta, igual que la columna de la base.</summary>
    public const int MaxDescriptionLength = 500;

    /// <summary>
    /// Tope combinado de remitente, asunto y cuerpo. Se recorta el texto como dato; el JSON del
    /// mensaje al modelo siempre queda bien formado.
    /// </summary>
    public const int MaxEmailTextLength = 4000;

    /// <summary>Tope del texto de respuesta del modelo, antes de intentar deserializarlo.</summary>
    public const int MaxResponseLength = 8192;

    private const string LabelIdProperty = "labelId";
    private const string UncertainProperty = "uncertain";

    /// <summary>
    /// Valida el catálogo que entrega la API. Vacío, con más de <see cref="MaxLabels"/>, con ids
    /// repetidos o no positivos, o con textos fuera de los límites de la base, falla cerrado.
    /// </summary>
    public static bool IsCatalogValid(IReadOnlyList<EmailLlmLabel>? labels)
    {
        if (labels is null || labels.Count is 0 or > MaxLabels)
        {
            return false;
        }

        var ids = new HashSet<int>();
        foreach (var label in labels)
        {
            if (label is null || label.LabelId <= 0 || !ids.Add(label.LabelId))
            {
                return false;
            }

            if (string.IsNullOrWhiteSpace(label.Name) || label.Name.Length > MaxNameLength)
            {
                return false;
            }

            if (label.Description?.Length > MaxDescriptionLength)
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// Lee la respuesta estricta del modelo. Devuelve <c>true</c> cuando el JSON cumple el contrato
    /// (aunque la decisión sea revisión); <c>false</c> cuando no se puede confiar en él.
    /// </summary>
    public static bool TryParse(
        string? responseText,
        IReadOnlyList<EmailLlmLabel> labels,
        out EmailLlmDecision decision)
    {
        decision = EmailLlmDecision.Review(EmailLlmReasons.ResponseInvalid);

        if (string.IsNullOrWhiteSpace(responseText)
            || responseText.Length > MaxResponseLength
            || !IsCatalogValid(labels))
        {
            return false;
        }

        int? labelId = null;
        bool? uncertain = null;
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            using var document = JsonDocument.Parse(responseText, new JsonDocumentOptions
            {
                AllowTrailingCommas = false,
                CommentHandling = JsonCommentHandling.Disallow
            });

            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            foreach (var property in root.EnumerateObject())
            {
                if (!seen.Add(property.Name))
                {
                    return false;
                }

                if (string.Equals(property.Name, LabelIdProperty, StringComparison.OrdinalIgnoreCase))
                {
                    if (property.Value.ValueKind == JsonValueKind.Null)
                    {
                        labelId = null;
                    }
                    else if (property.Value.ValueKind == JsonValueKind.Number
                             && property.Value.TryGetInt32(out var parsed))
                    {
                        labelId = parsed;
                    }
                    else
                    {
                        return false;
                    }
                }
                else if (string.Equals(property.Name, UncertainProperty, StringComparison.OrdinalIgnoreCase))
                {
                    if (property.Value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                    {
                        return false;
                    }

                    uncertain = property.Value.GetBoolean();
                }
                else
                {
                    return false;
                }
            }
        }
        catch (JsonException)
        {
            return false;
        }

        if (uncertain is null)
        {
            return false;
        }

        // Dudar, o no elegir etiqueta, es revisión. El modelo no puede devolver un id «de relleno».
        if (uncertain.Value || labelId is null)
        {
            decision = EmailLlmDecision.Review(EmailLlmReasons.Uncertain);
            return true;
        }

        // Solo ids presentes en el catálogo: nada fabricado llega al motor.
        if (!labels.Any(label => label.LabelId == labelId.Value))
        {
            decision = EmailLlmDecision.Review(EmailLlmReasons.LabelNotInCatalog);
            return true;
        }

        decision = new EmailLlmDecision(labelId, EmailLlmReasons.Model);
        return true;
    }
}
