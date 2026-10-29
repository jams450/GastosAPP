using GastosApp.BusinessLogic.Models.Email;

namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// Clasificación determinista de un correo a partir de las reglas del usuario. No escribe nada y no
/// llama a ningún modelo: el respaldo por LLM se orquesta en la capa API, que sí puede ver
/// <c>GastosApp.AI</c>.
/// </summary>
public interface IEmailClassificationService
{
    Task<EmailClassificationResult> ClassifyAsync(
        int userId,
        EmailMessageCandidate candidate,
        CancellationToken cancellationToken = default);
}
