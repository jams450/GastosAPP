using System.Net;
using System.Net.Http.Headers;
using GastosApp.API.Configuration;
using GastosApp.API.Extensions;
using GastosApp.API.Services.Telegram;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

internal static class NtfyNotificationTests
{
    public static async Task RunAsync()
    {
        static void Check(bool condition, string message)
        {
            if (!condition) throw new Exception(message);
        }

        var options = new NtfyOptions
        {
            Enabled = true, Server = "https://ntfy.amitzi.xyz/", Topic = "GastosApp", Token = "test-token"
        };
        var handler = new RecordingHandler();
        using var http = new HttpClient(handler);
        var ntfy = new NtfyAlertSender(http, Options.Create(options));
        const string payload = "Presupuesto: alimentación al 90% 📊";
        await ntfy.SendAsync(payload);
        Check(handler.Calls == 1 && handler.Method == HttpMethod.Post, "ntfy publishes exactly once using POST");
        Check(handler.Uri == "https://ntfy.amitzi.xyz/GastosApp", "ntfy uses the configured server and case-sensitive topic");
        Check(handler.Authorization?.Scheme == "Bearer" && handler.Authorization.Parameter == "test-token", "ntfy uses Bearer authentication");
        Check(handler.Body == payload && handler.Charset == "utf-8", "ntfy preserves the complete Unicode alert body");

        handler.Status = HttpStatusCode.Unauthorized;
        var rejected = false;
        try { await ntfy.SendAsync(payload); }
        catch (HttpRequestException) { rejected = true; }
        Check(rejected, "ntfy HTTP failures are not treated as success");

        options.Enabled = false;
        var before = handler.Calls;
        await ntfy.SendAsync(payload);
        Check(handler.Calls == before, "disabled ntfy makes no HTTP request");
        options.Enabled = true;
        await ntfy.SendAsync(" ");
        Check(handler.Calls == before, "empty notification makes no HTTP request");

        var telegram = new StubSender();
        var mirror = new StubSender();
        var fanout = new MirroredTelegramAlertSender(telegram, mirror, NullLogger<MirroredTelegramAlertSender>.Instance);
        await fanout.SendAsync(payload);
        Check(telegram.Messages.SequenceEqual(new[] { payload }) && mirror.Messages.SequenceEqual(new[] { payload }), "both channels receive the same alert");
        mirror.Fail = true;
        await fanout.SendAsync(payload);
        Check(telegram.Messages.Count == 2 && mirror.Messages.Count == 2, "ntfy failure does not fail or repeat Telegram delivery");
        telegram.Fail = true;
        rejected = false;
        try { await fanout.SendAsync(payload); }
        catch (HttpRequestException) { rejected = true; }
        Check(rejected && mirror.Messages.Count == 2, "Telegram failure propagates to its existing outbox retry without sending ntfy yet");
        telegram.Fail = false;
        mirror.Fail = false;
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        var cancelledSend = false;
        try { await fanout.SendAsync(payload, cancelled.Token); }
        catch (OperationCanceledException) { cancelledSend = true; }
        Check(cancelledSend && telegram.Messages.Count == 3, "shutdown cancellation propagates without sending");

        foreach (var (server, topic, token) in new[]
        {
            ("http://ntfy.amitzi.xyz", "GastosApp", "test-token"),
            ("https://user:pass@ntfy.amitzi.xyz", "GastosApp", "test-token"),
            ("https://ntfy.amitzi.xyz?secret=value", "GastosApp", "test-token"),
            ("https://ntfy.amitzi.xyz", "../other", "test-token"),
            ("https://ntfy.amitzi.xyz", "GastosApp", "SET_FROM_ENV"),
            ("https://ntfy.amitzi.xyz", "GastosApp", "")
        })
        {
            var values = new Dictionary<string, string?>
            {
                ["Ntfy:Enabled"] = "true", ["Ntfy:Server"] = server,
                ["Ntfy:Topic"] = topic, ["Ntfy:Token"] = token
            };
            var config = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
            using var services = new ServiceCollection().AddApiAlertsConfiguration(config).BuildServiceProvider();
            rejected = false;
            try { _ = services.GetRequiredService<IOptions<NtfyOptions>>().Value; }
            catch (OptionsValidationException) { rejected = true; }
            Check(rejected, "enabled ntfy rejects unsafe endpoint, topic or missing token");
        }
        var disabledConfig = new ConfigurationBuilder().Build();
        using var disabledServices = new ServiceCollection().AddApiAlertsConfiguration(disabledConfig).BuildServiceProvider();
        Check(!disabledServices.GetRequiredService<IOptions<NtfyOptions>>().Value.Enabled, "existing deployments remain disabled without ntfy configuration");
        Console.WriteLine("PASS ntfy notifications (offline HTTP, fan-out, failure isolation and configuration)");
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public int Calls;
        public HttpMethod? Method;
        public string? Uri, Body, Charset;
        public AuthenticationHeaderValue? Authorization;
        public HttpStatusCode Status = HttpStatusCode.OK;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            Method = request.Method;
            Uri = request.RequestUri?.AbsoluteUri;
            Authorization = request.Headers.Authorization;
            Body = await request.Content!.ReadAsStringAsync(ct);
            Charset = request.Content.Headers.ContentType?.CharSet;
            return new HttpResponseMessage(Status);
        }
    }

    private sealed class StubSender : ITelegramAlertSender, INtfyAlertSender
    {
        public readonly List<string> Messages = new();
        public bool Fail;
        public Task SendAsync(string text, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Messages.Add(text);
            if (Fail) throw new HttpRequestException("Synthetic failure");
            return Task.CompletedTask;
        }
    }
}
