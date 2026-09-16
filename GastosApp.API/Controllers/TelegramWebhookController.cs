using System.Security.Cryptography;
using System.Text;
using GastosApp.API.Configuration;
using GastosApp.API.Services.Telegram;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/telegram")]
[AllowAnonymous]
public sealed class TelegramWebhookController : ControllerBase
{
    private const long MaxWebhookBodyBytes = 64 * 1024;

    private readonly TelegramOptions _options;
    private readonly ITelegramIdentityService _identities;
    private readonly ITelegramUpdateService _updateService;
    private readonly ILogger<TelegramWebhookController> _logger;

    public TelegramWebhookController(
        IOptions<TelegramOptions> options,
        ITelegramIdentityService identities,
        ITelegramUpdateService updateService,
        ILogger<TelegramWebhookController> logger)
    {
        _options = options.Value;
        _identities = identities;
        _updateService = updateService;
        _logger = logger;
    }

    [HttpPost("webhook")]
    [RequestSizeLimit(MaxWebhookBodyBytes)]
    public async Task<IActionResult> Webhook([FromBody] Update update, CancellationToken cancellationToken)
    {
        if (!_options.Enabled)
        {
            return NotFound();
        }

        if (!HasValidSecret(Request.Headers["X-Telegram-Bot-Api-Secret-Token"].ToString(), _options.WebhookSecret))
        {
            return Unauthorized();
        }

        var message = update.Message;
        var from = message?.From;
        var chat = message?.Chat;
        if (message is null || from is null || chat is null)
        {
            return Ok();
        }

        // Solo chat privado: el bot no atiende grupos ni canales.
        if (chat.Type != ChatType.Private || chat.Id != from.Id)
        {
            return Forbid();
        }

        var identity = await ResolveIdentityAsync(from.Id, chat.Id, cancellationToken);
        if (identity is null)
        {
            return Forbid();
        }

        // Coherencia: la identidad persistida debe apuntar al mismo chat privado del update.
        // Si no coincide, se rechaza en vez de "propagar" el chat del mensaje a la identidad.
        if (identity.TelegramChatId != chat.Id)
        {
            _logger.LogWarning("Telegram identity chat mismatch for update.");
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(message.Text))
        {
            return Ok();
        }

        await _updateService.HandleAsync(update, identity, cancellationToken);
        return Ok();
    }

    /// <summary>
    /// La configuración solo siembra la identidad la primera vez. Una vez que existe fila en BD,
    /// la BD es la autoridad (cambios en <c>Telegram:AllowedUserId</c>/<c>AppUserId</c> no re-autorizan).
    /// La autorización final siempre revalida identidad y usuario de Gastos activos.
    /// </summary>
    private async Task<TelegramIdentity?> ResolveIdentityAsync(
        long telegramUserId,
        long chatId,
        CancellationToken cancellationToken)
    {
        var existing = await _identities.GetByTelegramUserIdAsync(telegramUserId, cancellationToken);
        if (existing is null)
        {
            if (telegramUserId != _options.AllowedUserId)
            {
                return null;
            }

            try
            {
                await _identities.SeedIfMissingAsync(telegramUserId, chatId, _options.AppUserId, cancellationToken);
            }
            catch (ArgumentException)
            {
                // Bootstrap inválido (usuario inexistente/inactivo): no se autoriza ni se propaga detalle.
                _logger.LogWarning("Telegram identity bootstrap rejected for update user.");
                return null;
            }
        }

        // Autorización final: revalida la fila activa y que el usuario de Gastos dueño siga activo.
        // Null si la identidad está desactivada o su usuario fue desactivado.
        return await _identities.GetActiveByTelegramUserIdAsync(telegramUserId, cancellationToken);
    }

    private static bool HasValidSecret(string providedSecret, string expectedSecret)
    {
        var providedBytes = Encoding.UTF8.GetBytes(providedSecret);
        var expectedBytes = Encoding.UTF8.GetBytes(expectedSecret);
        return CryptographicOperations.FixedTimeEquals(providedBytes, expectedBytes);
    }
}
