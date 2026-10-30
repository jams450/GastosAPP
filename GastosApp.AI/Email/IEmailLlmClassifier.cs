namespace GastosApp.AI.Email;

/// <summary>
/// Respaldo LLM terminal del clasificador de correo (S15). Se usa solo en los escenarios acotados que
/// la API decida; el presupuesto global de llamadas y la ejecución en segundo plano viven en el
/// llamador, no aquí.
/// </summary>
public interface IEmailLlmClassifier
{
    /// <summary>
    /// Elige una etiqueta del catálogo o devuelve revisión. Nunca lanza por datos, configuración ni
    /// fallos del modelo; solo propaga la cancelación del llamador.
    /// </summary>
    Task<EmailLlmDecision> ClassifyAsync(EmailLlmRequest request, CancellationToken cancellationToken);
}
