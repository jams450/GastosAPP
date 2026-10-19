using System.Net;
using GastosApp.API;
using GastosApp.API.Security;
using GastosApp.API.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins how a request with no usable user identity is reported.
/// <para>
/// Two layers disagreed. The exception handler maps <c>UnauthorizedAccessException</c> to 401, and
/// the controllers throw exactly that when the claim is missing. <c>ICurrentUserService</c> instead
/// threw <c>InvalidOperationException</c>, which the same handler maps to 500. A caller with no valid
/// identity therefore saw "internal server error" in one path and "unauthorized" in another, and the
/// documented behaviour in AGENTS.md matched only one of them.
/// </para>
/// <para>
/// The handler mapping is pinned too, so the 401 the service now relies on is a fact rather than an
/// assumption about a switch expression.
/// </para>
/// </summary>
public class MissingUserIdentityTests
{
    [Fact]
    public void GetRequiredUserId_reports_an_authentication_failure_not_an_internal_error()
    {
        var service = new CurrentUserService(new HttpContextAccessor { HttpContext = new DefaultHttpContext() });

        Assert.Throws<UnauthorizedAccessException>(() => service.GetRequiredUserId());
    }

    [Fact]
    public void GetRequiredUserId_returns_the_claim_when_it_is_present()
    {
        var context = new DefaultHttpContext();
        context.User = new System.Security.Claims.ClaimsPrincipal(
            new System.Security.Claims.ClaimsIdentity(
                [new System.Security.Claims.Claim(ClaimNames.NameIdentifier, "42")]));

        var service = new CurrentUserService(new HttpContextAccessor { HttpContext = context });

        Assert.Equal(42, service.GetRequiredUserId());
    }

    [Theory]
    [InlineData(typeof(UnauthorizedAccessException), StatusCodes.Status401Unauthorized)]
    [InlineData(typeof(ArgumentException), StatusCodes.Status400BadRequest)]
    [InlineData(typeof(InvalidOperationException), StatusCodes.Status500InternalServerError)]
    public async Task Exception_handler_maps_the_exception_to_its_documented_status(Type exceptionType, int expectedStatus)
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var handler = new ExceptionHandler(NullLogger<ExceptionHandler>.Instance);
        var exception = (Exception)Activator.CreateInstance(exceptionType, "probe")!;

        var handled = await handler.TryHandleAsync(context, exception, CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(expectedStatus, context.Response.StatusCode);
    }
}
