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
    .AddApiDatabase(builder.Configuration)
    .AddApiAuthentication(builder.Configuration)
    .AddApiAuthorization()
    .AddApiApplicationServices();

var app = builder.Build();

app.UseApiOpenApiIfDevelopment();

app.UseExceptionHandler();
app.UseCors("Production");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
