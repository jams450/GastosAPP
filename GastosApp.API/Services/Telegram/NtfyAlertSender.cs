using System.Net.Http.Headers;
using System.Text;
using GastosApp.API.Configuration;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Telegram;

public interface INtfyAlertSender
{
    Task SendAsync(string text, CancellationToken cancellationToken = default);
}

public sealed class NtfyAlertSender(HttpClient http, IOptions<NtfyOptions> options) : INtfyAlertSender
{
    public async Task SendAsync(string text, CancellationToken cancellationToken = default)
    {
        var settings = options.Value;
        if (!settings.Enabled || string.IsNullOrWhiteSpace(text)) return;
        if (!settings.HasSafeEndpoint() || !settings.HasToken())
            throw new InvalidOperationException("ntfy is not configured.");

        var endpoint = new Uri(settings.Server.TrimEnd('/') + "/" + settings.Topic);
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.Token);
        request.Content = new StringContent(text, Encoding.UTF8, "text/plain");
        using var response = await http.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
    }
}
