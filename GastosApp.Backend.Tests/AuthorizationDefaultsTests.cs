using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the authorization default for S6.
/// <para>
/// Every controller in this application carries an explicit authorization attribute, but that is a
/// convention, not a mechanism: there was no fallback policy, so a controller added without an
/// attribute would have been silently public. These probes make the default closed and keep it
/// observable.
/// </para>
/// <para>
/// Two independent layers are checked on purpose. The reflection probe catches a controller whose
/// intent is unstated, and the request probe catches a default that stopped being enforced, which
/// no amount of attribute-reading would notice.
/// </para>
/// </summary>
public class AuthorizationDefaultsTests : IClassFixture<UnattributedProbeFactory>
    , IClassFixture<ApiFactory>
{
    private readonly UnattributedProbeFactory _probeFactory;
    private readonly ApiFactory _plainFactory;

    public AuthorizationDefaultsTests(UnattributedProbeFactory probeFactory, ApiFactory plainFactory)
    {
        _probeFactory = probeFactory;
        _plainFactory = plainFactory;
    }

    [Fact]
    public async Task An_endpoint_with_no_authorization_metadata_is_not_public()
    {
        using var client = _probeFactory.CreateClient();

        using var response = await client.GetAsync("/probe/unattributed");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Every_controller_states_whether_it_is_authorized_or_anonymous()
    {
        var controllers = typeof(Program).Assembly.GetTypes()
            .Where(type => !type.IsAbstract && typeof(ControllerBase).IsAssignableFrom(type))
            .ToArray();

        // Guards this probe itself: if reflection stops finding controllers, everything below would
        // pass over an empty set and prove nothing.
        Assert.True(controllers.Length >= 19, $"Only {controllers.Length} controllers were discovered.");

        var unstated = controllers
            .Where(type => !type.GetCustomAttributes<AuthorizeAttribute>(inherit: true).Any()
                && type.GetCustomAttribute<AllowAnonymousAttribute>(inherit: true) is null)
            .Select(type => type.Name)
            .ToArray();

        Assert.True(
            unstated.Length == 0,
            $"These controllers neither require authorization nor declare themselves anonymous, so their "
            + $"intent is unstated and the default decides for them: {string.Join(", ", unstated)}.");
    }

    [Fact]
    public async Task The_public_authentication_endpoints_stay_reachable_without_a_token()
    {
        using var client = _plainFactory.CreateClient();

        using var login = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "probe@example.invalid", password = "not-the-password" });

        // The connection is closed, so this is a 500. What matters is that authorization did not
        // block the request, and that it failed later, in the handler.
        Assert.NotEqual(HttpStatusCode.Unauthorized, login.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, login.StatusCode);
    }

    [Fact]
    public async Task The_telegram_webhook_stays_reachable_without_a_token()
    {
        using var client = _plainFactory.CreateClient();

        using var response = await client.PostAsJsonAsync("/api/telegram/webhook", new { update_id = 1 });

        // Telegram is disabled, so the controller answers 404 from inside its own guard. Again the
        // point is that authorization let the request reach the handler.
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
