using GastosApp.API.Models.EmailClassification;
using GastosApp.API.Services.Email;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Módulo de prueba del clasificador de correo. Todo lo de este controlador es lectura: no registra
/// mensajes ni crea borradores, así que se puede iterar sobre las reglas sin efectos. Cuando se pide
/// un buzón, la lectura es IMAP de solo lectura: no marca leídos, no etiqueta y no mueve nada.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class EmailClassificationController : ControllerBase
{
    private readonly EmailPreviewService _previewService;
    private readonly IImapMailboxSource _imap;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<EmailClassificationController> _logger;

    public EmailClassificationController(
        EmailPreviewService previewService,
        IImapMailboxSource imap,
        ICurrentUserService currentUserService,
        ILogger<EmailClassificationController> logger)
    {
        _previewService = previewService;
        _imap = imap;
        _currentUserService = currentUserService;
        _logger = logger;
    }

    /// <summary>
    /// Buzones y etiquetas que expone el correo configurado. Responde 200 siempre a propósito: si no
    /// hay configuración o no se puede conectar, la UI necesita un motivo legible, no un 500 que
    /// parezca un error del programa.
    /// </summary>
    [HttpGet("mailboxes")]
    public async Task<IActionResult> GetMailboxes(CancellationToken cancellationToken)
    {
        if (!_imap.IsConfigured)
        {
            return Ok(new
            {
                configured = false,
                mailboxes = Array.Empty<string>(),
                message = "La conexión IMAP no está configurada: faltan Email__Imap__Username y Email__Imap__Password (contraseña de aplicación)."
            });
        }

        try
        {
            var mailboxes = await _imap.ListMailboxesAsync(cancellationToken);
            return Ok(new { configured = true, mailboxes, message = (string?)null });
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            // Se registra el tipo, no el mensaje: los errores de autenticación de MailKit pueden
            // arrastrar detalles del servidor que no tienen por qué viajar al cliente.
            _logger.LogWarning("IMAP mailbox listing failed: {ErrorType}", exception.GetType().Name);
            return Ok(new
            {
                configured = true,
                mailboxes = Array.Empty<string>(),
                message = "No se pudo conectar al buzón. Revisa host, puerto y la contraseña de aplicación."
            });
        }
    }

    /// <summary>
    /// Clasifica una muestra contra las reglas actuales del usuario y devuelve el veredicto de cada
    /// correo. Acepta mensajes crudos (<c>.eml</c>, solo se leen cabeceras), candidatos escritos a
    /// mano y, si se indica <c>mailbox</c>, los mensajes más recientes de ese buzón leídos por IMAP.
    /// </summary>
    [HttpPost("preview")]
    public async Task<IActionResult> Preview(
        [FromBody] EmailPreviewRequest request,
        CancellationToken cancellationToken)
    {
        var userId = _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");

        try
        {
            var result = await _previewService.PreviewAsync(userId, request, cancellationToken);
            return Ok(result);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (!string.IsNullOrWhiteSpace(request.Mailbox))
        {
            // Solo se atrapa cuando la petición pidió el buzón: ahí el fallo es una condición de
            // configuración o de red que el usuario puede corregir, no un defecto del servidor. El
            // camino con archivos .eml sigue sin tragarse errores.
            _logger.LogWarning("IMAP preview failed: {ErrorType}", exception.GetType().Name);
            return BadRequest(new
            {
                message = "No se pudo leer el buzón. Revisa la configuración IMAP y el nombre del buzón."
            });
        }
    }
}
