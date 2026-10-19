using GastosApp.API;
using GastosApp.API.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ExceptionHandler>();

builder.Services
    .AddApiMvc()
    .AddApiOpenApi()
    .AddApiHttpContext()
    .AddApiCors(builder.Configuration)
    .AddApiRateLimiting(builder.Configuration)
    .AddApiTelegramConfiguration(builder.Configuration)
    .AddApiAlertsConfiguration(builder.Configuration)
    .AddApiDatabase(builder.Configuration)
    .AddApiAuthentication(builder.Configuration)
    .AddApiAuthorization()
    .AddApiApplicationServices();

var app = builder.Build();

app.UseApiOpenApiIfDevelopment();

app.UseExceptionHandler();
app.UseCors("Production");
// Before authentication on purpose: a rejected attempt must not cost a database round trip to
// validate the token, and the authentication endpoints are unauthenticated anyway.
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

// Needed by GastosApp.Backend.Tests to boot the real pipeline through WebApplicationFactory.
// Top-level statements declare Program as internal; this makes it visible without relaxing
// anything else.
public partial class Program;
