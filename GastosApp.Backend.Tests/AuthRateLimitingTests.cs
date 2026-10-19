using System.Net;
using System.Net.Http.Json;

namespace GastosApp.Backend.Tests;

/// <summary>
/// The authentication endpoints are the only public, unauthenticated surface of this application.
/// Before this control existed, the sole defence was a per-account lockout, which a password spray
/// across many accounts never touches and which costs the attacker nothing to attempt.
/// <para>
/// Asserted through the real pipeline rather than against a configuration object, because the
/// control only exists if the middleware runs in the right place in the request order.
/// </para>
/// <para>
/// One test, deliberately. The test host reports no peer address, so every request shares one
/// partition: splitting these assertions across two facts would let whichever runs second start
/// with a budget the first one already spent. The sequence below is the whole scenario.
/// </para>
/// </summary>
public class AuthRateLimitingTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AuthRateLimitingTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Auth_endpoints_reject_once_the_window_budget_is_spent()
    {
        using var client = _factory.CreateClient();

        var withinBudget = new List<HttpStatusCode>();
        for (var attempt = 0; attempt < ApiFactory.AuthPermitLimit; attempt++)
        {
            using var response = await Login(client);
            withinBudget.Add(response.StatusCode);
        }

        Assert.DoesNotContain(HttpStatusCode.TooManyRequests, withinBudget);

        using var overBudget = await Login(client);
        Assert.Equal(HttpStatusCode.TooManyRequests, overBudget.StatusCode);

        // The policy is declared once on the controller, so it also covers refresh and logout.
        using var refresh = await client.PostAsJsonAsync(
            "/api/auth/refresh",
            new { refreshToken = "not-a-real-token" });

        Assert.Equal(HttpStatusCode.TooManyRequests, refresh.StatusCode);
    }

    private static Task<HttpResponseMessage> Login(HttpClient client) =>
        client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "probe@example.invalid", password = "not-the-password" });
}
