using System.Net;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the endpoints that are not controllers, because the fail-closed default reaches them too.
/// <para>
/// Adding the fallback authorization policy in T7a changed two behaviours that had nothing to do
/// with authentication. Independent verification caught both; measuring them against the baseline
/// commit settled what each one actually was.
/// </para>
/// </summary>
public class DevelopmentEndpointTests : IClassFixture<DevelopmentApiFactory>
{
    private readonly DevelopmentApiFactory _factory;

    public DevelopmentEndpointTests(DevelopmentApiFactory factory) => _factory = factory;

    [Fact]
    public async Task The_openapi_document_is_not_blocked_by_authorization()
    {
        // The OpenAPI document is mapped outside the controller pipeline, so it carries no
        // authorization metadata of its own and the fallback policy would demand a token to read the
        // API documentation. AllowAnonymous keeps its reachability identical to the baseline.
        //
        // Asserted as "not blocked by authorization" rather than as 200, deliberately. This endpoint
        // answers 500 for an unrelated and pre-existing reason: Microsoft.AspNetCore.OpenApi 9.0.4
        // throws "The node must be of type 'JsonValue'" from ApplyValidationAttributes while building
        // a request-body schema, because a nullable value type carrying a validation attribute
        // produces an anyOf schema instead of a scalar (for example [Range(1, int.MaxValue)] on
        // int? CategoryId in UpdateTransactionRequest). Measured identical at dc3b4d5, so this change
        // did not cause it, and asserting 500 here would freeze a bug as intended behaviour.
        using var client = _factory.CreateClient();

        using var response = await client.GetAsync("/openapi/v1.json");

        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
