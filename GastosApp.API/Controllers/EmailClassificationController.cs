using GastosApp.API.Models.EmailClassification;
using GastosApp.API.Services.Email;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Módulo de prueba del clasificador de correo. Todo lo de este controlador es lectura: no
/// registra mensajes ni crea borradores, así que se puede iterar sobre las reglas sin efectos.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class EmailClassificationController : ControllerBase
{
    private readonly EmailPreviewService _previewService;
    private readonly ICurrentUserService _currentUserService;

    public EmailClassificationController(
        EmailPreviewService previewService,
        ICurrentUserService currentUserService)
    {
        _previewService = previewService;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Clasifica una muestra contra las reglas actuales del usuario y devuelve el veredicto de cada
    /// correo. Acepta mensajes crudos (<c>.eml</c>, solo se leen cabeceras) y candidatos escritos a
    /// mano, para comparar los dos casos en una sola corrida.
    /// </summary>
    [HttpPost("preview")]
    public async Task<IActionResult> Preview(
        [FromBody] EmailPreviewRequest request,
        CancellationToken cancellationToken)
    {
        var userId = _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");

        var result = await _previewService.PreviewAsync(userId, request, cancellationToken);
        return Ok(result);
    }
}
