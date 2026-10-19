using GastosApp.AI.Client;
using GastosApp.AI.Configuration;
using GastosApp.AI.Intent;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the LLM client lifetime for S5.
/// <para>
/// Both LLM call sites built a new <c>OpenAIClient</c> per call, and each instance owns its own HTTP
/// pipeline and connection pool. On the Telegram path that is one construction per message: no
/// connection reuse, and a handler chain per message.
/// </para>
/// <para>
/// The rebuild has to stay fault-tolerant while becoming shared. A malformed endpoint used to throw
/// inside the extracted try/catch and degrade to the generic answer; building eagerly at DI
/// resolution time instead would throw while the container builds a Telegram service and take down
/// the whole command path.
/// </para>
/// </summary>
public class LlmClientReuseTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public LlmClientReuseTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public void The_client_is_built_once_and_reused()
    {
        var provider = Create(Usable());

        var first = provider.TryGet();
        var second = provider.TryGet();

        Assert.NotNull(first);
        Assert.Same(first, second);
    }

    [Fact]
    public void The_provider_is_a_singleton_in_the_real_composition_root()
    {
        // The lifetime is what makes reuse real; a scoped registration would silently restore the
        // per-request construction this change removes.
        var first = _factory.Services.GetRequiredService<ILlmChatClientProvider>();
        var second = _factory.Services.GetRequiredService<ILlmChatClientProvider>();

        Assert.Same(first, second);
    }

    [Theory]
    [InlineData("", "key", "model")]
    [InlineData("SET_FROM_ENV", "key", "model")]
    [InlineData("https://example.invalid/v1", "", "model")]
    [InlineData("https://example.invalid/v1", "key", "")]
    [InlineData("https://example.invalid/v1", "SET_FROM_ENV", "model")]
    [InlineData("not a url", "key", "model")]
    public void Unusable_configuration_yields_no_client_instead_of_throwing(string baseUrl, string apiKey, string model)
    {
        var provider = Create(new LlmOptions { BaseUrl = baseUrl, ApiKey = apiKey, Model = model });

        Assert.Null(provider.TryGet());
    }

    [Fact]
    public async Task The_extractor_answers_generically_when_no_client_is_available()
    {
        var provider = new RecordingProvider(null);
        var extractor = new ExpenseIntentExtractor(provider, NullLogger<ExpenseIntentExtractor>.Instance);

        var result = await extractor.ExtractAsync(Request(), CancellationToken.None);

        Assert.Equal(IntentKind.Desconocido, result.Kind);
        Assert.NotNull(result.PreguntaAclaratoria);
        Assert.Equal(1, provider.Calls);
    }

    private static LlmChatClientProvider Create(LlmOptions options) =>
        new(Options.Create(options), NullLogger<LlmChatClientProvider>.Instance);

    private static LlmOptions Usable() =>
        new() { BaseUrl = "https://llm.example.invalid/v1", ApiKey = "probe-key", Model = "probe-model" };

    private static IntentRequest Request() =>
        new("gasté 100 en comida", DateTimeOffset.UtcNow, "America/Mexico_City", [], [], [], [], []);

    private sealed class RecordingProvider(IChatClient? client) : ILlmChatClientProvider
    {
        public int Calls { get; private set; }

        public IChatClient? TryGet()
        {
            Calls++;
            return client;
        }
    }
}
