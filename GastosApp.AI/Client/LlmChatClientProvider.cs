using System.ClientModel;
using GastosApp.AI.Configuration;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OpenAI;

namespace GastosApp.AI.Client;

/// <summary>Source of the shared chat client, or <c>null</c> when the LLM is not usable.</summary>
public interface ILlmChatClientProvider
{
    /// <summary>
    /// The process-wide client, or <c>null</c> when <see cref="LlmOptions"/> is not usable or the
    /// client cannot be built. Never throws: callers fall back to their generic answer.
    /// </summary>
    IChatClient? TryGet();
}

/// <summary>
/// Builds the OpenAI-compatible chat client once and hands the same instance to every caller.
/// <para>
/// Each call used to construct a new <c>OpenAIClient</c>, and each instance owns its own HTTP
/// pipeline and connection pool. On the Telegram path — one message, one construction — that means
/// no connection reuse and a fresh handler chain per message.
/// </para>
/// <para>
/// Construction is lazy and fault-tolerant. The client is built on first use rather than at
/// resolution time, so a malformed endpoint makes <see cref="TryGet"/> return <c>null</c> instead of
/// throwing while the DI container is building a Telegram service, which would take down the whole
/// command path.
/// </para>
/// </summary>
public sealed class LlmChatClientProvider : ILlmChatClientProvider
{
    private readonly LlmOptions _options;
    private readonly ILogger<LlmChatClientProvider> _logger;
    private readonly Lazy<IChatClient?> _client;

    public LlmChatClientProvider(IOptions<LlmOptions> options, ILogger<LlmChatClientProvider> logger)
    {
        _options = options.Value;
        _logger = logger;

        // ExecutionAndPublication: concurrent Telegram messages must not each build a client.
        _client = new Lazy<IChatClient?>(Build, LazyThreadSafetyMode.ExecutionAndPublication);
    }

    public IChatClient? TryGet() => _client.Value;

    private IChatClient? Build()
    {
        if (!_options.IsUsable || !Uri.TryCreate(_options.BaseUrl, UriKind.Absolute, out var endpoint))
        {
            return null;
        }

        try
        {
            return new OpenAIClient(
                    new ApiKeyCredential(_options.ApiKey),
                    new OpenAIClientOptions { Endpoint = endpoint })
                .GetChatClient(_options.Model)
                .AsIChatClient();
        }
        catch (Exception exception)
        {
            // Only the type: third-party messages can carry the endpoint and the key.
            _logger.LogWarning("LLM client could not be created: {ErrorType}", exception.GetType().Name);
            return null;
        }
    }
}
