using GastosApp.API.Models.EmailClassification;
using GastosApp.API.Services.Email;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Módulo de prueba del clasificador de correo. La vista previa es lectura: no registra mensajes ni
/// crea borradores, así que se puede iterar sobre las reglas sin efectos, y cuando se pide un buzón la
/// lectura es IMAP de solo lectura. La única acción que escribe es <c>apply</c>, y solo agrega
/// etiquetas ya existentes a los mensajes de la muestra que se acaba de revisar.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "UserWithId")]
public class EmailClassificationController : ControllerBase
{
    private readonly EmailPreviewService _previewService;
    private readonly EmailApplyService _applyService;
    private readonly IImapMailboxSource _imap;
    private readonly ICurrentUserService _currentUserService;
    private readonly ILogger<EmailClassificationController> _logger;

    public EmailClassificationController(
        EmailPreviewService previewService,
        EmailApplyService applyService,
        IImapMailboxSource imap,
        ICurrentUserService currentUserService,
        ILogger<EmailClassificationController> logger)
    {
        _previewService = previewService;
        _applyService = applyService;
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
    /// Cuando la muestra viene del buzón, la respuesta incluye <c>applyToken</c>,
    /// <c>applyExpiresAt</c> y <c>applicableCount</c> para aplicar esa misma muestra.
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

    /// <summary>
    /// Aplica las etiquetas de la muestra revisada. El cuerpo solo lleva el token que devolvió la
    /// vista previa: no se puede pedir una búsqueda nueva ni elegir un subconjunto. La escritura es
    /// exclusivamente «agregar una etiqueta existente»: nunca se crean etiquetas, ni se mueven, ni se
    /// borran, ni se expurga. Un token inválido o vencido se rechaza antes de abrir el buzón.
    /// </summary>
    [HttpPost("apply")]
    public async Task<IActionResult> Apply(
        [FromBody] EmailApplyRequest request,
        CancellationToken cancellationToken)
    {
        var userId = _currentUserService.GetUserId()
            ?? throw new UnauthorizedAccessException("Missing or invalid user identity claim");

        try
        {
            var result = await _applyService.ApplyAsync(userId, request?.Token, cancellationToken);
            return Ok(result);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (EmailApplyRefusedException exception)
        {
            // Rechazo previo a cualquier escritura: se registra el código, no el token ni el plan.
            _logger.LogWarning("Email apply refused: {ReasonCode}", exception.Code);
            return BadRequest(new { message = exception.Message });
        }
        catch (Exception exception)
        {
            _logger.LogWarning("Email apply failed: {ErrorType}", exception.GetType().Name);
            return BadRequest(new
            {
                message = "No se pudo aplicar la muestra al buzón. Revisa la configuración IMAP y vuelve a generar la muestra."
            });
        }
    }
}
