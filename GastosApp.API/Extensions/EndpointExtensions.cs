namespace GastosApp.API.Extensions;

public static class EndpointExtensions
{
    public static WebApplication UseApiOpenApiIfDevelopment(this WebApplication app)
    {
        if (app.Environment.IsDevelopment())
        {
            // AllowAnonymous porque este endpoint se mapea fuera del pipeline de controladores y no
            // lleva metadatos de autorización propios: la política por defecto de AddApiAuthorization
            // exigiría un token para poder leer la documentación del API. Solo existe en Development.
            app.MapOpenApi().AllowAnonymous();
        }

        return app;
    }
}
