using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using GastosApp.API.Configuration;
using GastosApp.API.Services.Telegram;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Telegram.Bot.Types;

namespace GastosApp.API.Controllers;

[ApiController]
[Route("api/telegram")]
[AllowAnonymous]
public sealed class TelegramWebhookController : ControllerBase
{
    private const int MaxProcessedUpdates = 10_000;
    private static readonly ConcurrentDictionary<int, byte> ProcessedUpdates = new();
    private readonly TelegramOptions _options;
    private readonly ITelegramUpdateService _updateService;

    public TelegramWebhookController(IOptions<TelegramOptions> options, ITelegramUpdateService updateService)
    {
        _options = options.Value;
        _updateService = updateService;
    }

    [HttpPost("webhook")]
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

        if (update.Message?.From?.Id != _options.AllowedUserId)
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(update.Message.Text))
        {
            return Ok();
        }

        if (!ProcessedUpdates.TryAdd(update.Id, 0))
        {
            return Ok();
        }

        if (ProcessedUpdates.Count > MaxProcessedUpdates)
        {
            ProcessedUpdates.Clear();
        }

        await _updateService.HandleAsync(update, cancellationToken);
        return Ok();
    }

    private static bool HasValidSecret(string providedSecret, string expectedSecret)
    {
        var providedBytes = Encoding.UTF8.GetBytes(providedSecret);
        var expectedBytes = Encoding.UTF8.GetBytes(expectedSecret);
        return CryptographicOperations.FixedTimeEquals(providedBytes, expectedBytes);
    }
}
