namespace GastosApp.AI.Email;

/// <summary>
/// Etiqueta real del catálogo del usuario, tal como la API la entrega. El componente no filtra por
/// comportamiento: una etiqueta de descarte como «Eliminar» es una opción válida más.
/// </summary>
public sealed record EmailLlmLabel(int LabelId, string Name, string? Description);

/// <summary>
/// Metadatos del correo candidato y las únicas etiquetas entre las que se puede elegir.
/// <para>
/// <see cref="Body"/> es opcional. Remitente, asunto y cuerpo son datos: se recortan a un máximo de
/// 4000 caracteres combinados y nunca se interpretan como instrucciones.
/// </para>
/// </summary>
public sealed record EmailLlmRequest(
    string? Sender,
    string? Subject,
    string? Body,
    IReadOnlyList<EmailLlmLabel> Labels);

/// <summary>
/// Decisión del respaldo LLM. <see cref="LabelId"/> nulo significa «revisión humana»: el componente
/// nunca inventa una etiqueta. <see cref="Reason"/> es una constante interna, jamás el cuerpo del
/// correo ni un mensaje de excepción.
/// </summary>
public sealed record EmailLlmDecision(int? LabelId, string? Reason)
{
    /// <summary>Sin etiqueta decidida: el correo va a revisión.</summary>
    public bool Uncertain => LabelId is null;

    public static EmailLlmDecision Review(string reason) => new(null, reason);
}

/// <summary>Motivos estables de una decisión. No incluyen datos del correo ni secretos.</summary>
public static class EmailLlmReasons
{
    /// <summary>El modelo eligió una etiqueta que existe en el catálogo.</summary>
    public const string Model = "llm";

    /// <summary>No hay cliente LLM configurado o no se pudo construir.</summary>
    public const string ProviderUnavailable = "provider_unavailable";

    /// <summary>El catálogo recibido no es utilizable; no se llamó al modelo.</summary>
    public const string CatalogInvalid = "catalog_invalid";

    /// <summary>La respuesta no cumplió el contrato JSON estricto.</summary>
    public const string ResponseInvalid = "response_invalid";

    /// <summary>El modelo dudó explícitamente o no eligió etiqueta.</summary>
    public const string Uncertain = "uncertain";

    /// <summary>El modelo devolvió un id que no pertenece al catálogo.</summary>
    public const string LabelNotInCatalog = "label_not_in_catalog";

    /// <summary>La llamada falló o expiró sin que el llamador cancelara.</summary>
    public const string Error = "error";
}
