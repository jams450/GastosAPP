using GastosApp.AI.Email;
using GastosApp.API.BackgroundServices;
using GastosApp.API.Configuration;
using GastosApp.API.Services.Email;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Email;
using GastosApp.BusinessLogic.Services;

namespace GastosApp.API.Extensions;

public static class EmailConfigurationExtensions
{
    public static IServiceCollection AddApiEmailConfiguration(this IServiceCollection services, IConfiguration configuration)
    {
        // Se enlaza sin validación de arranque a propósito: una sección Email incompleta no debe
        // bloquear el arranque de la API. Misma regla que LlmOptions; el clasificador simplemente
        // usa los valores por defecto.
        services.AddOptions<EmailClassifierOptions>()
            .Bind(configuration.GetSection(EmailClassifierOptions.SectionName));

        services.AddScoped<IEmailLabelService, EmailLabelService>();
        services.AddScoped<IEmailRuleService, EmailRuleService>();
        services.AddScoped<IEmailClassificationService, EmailClassificationService>();

        // Respaldo LLM (S15). El clasificador de GastosApp.AI depende de ILlmChatClientProvider, que
        // ya está registrado como singleton por la configuración de Telegram: al resolverlo aquí se
        // reutiliza el MISMO proveedor, modelo y configuración. No se registra otra vez.
        //
        // EmailLlmClassificationService NO se registra como IEmailClassificationService a propósito:
        // decorar la interfaz global haría que el motor determinista se llamara a sí mismo y que
        // cualquier consumidor (y sus pruebas) dependiera de un modelo. Se inyecta solo en los dos
        // llamadores que gastan presupuesto, como parámetro opcional al final.
        services.AddScoped<IEmailLlmClassifier, EmailLlmClassifier>();
        services.AddScoped<EmailLlmClassificationService>();

        services.AddScoped<EmailPreviewService>();

        // Igual que EmailClassifierOptions: sin validación de arranque. Una config de correo a medias
        // no debe impedir que la API arranque; simplemente deja el IMAP apagado y el módulo de prueba
        // sigue funcionando con archivos .eml.
        services.AddOptions<ImapOptions>()
            .Bind(configuration.GetSection(ImapOptions.SectionName));

        // El mismo cliente implementa lectura y aplicación: se registra una sola instancia por scope
        // y ambas interfaces apuntan a ella, con una conexión IMAP propia por operación.
        services.AddScoped<ImapMailboxSource>();
        services.AddScoped<IImapMailboxSource>(provider => provider.GetRequiredService<ImapMailboxSource>());
        services.AddScoped<IImapLabelApplier>(provider => provider.GetRequiredService<ImapMailboxSource>());

        // Pase diario (S13/L28): apagado por defecto. La lectura diaria es una interfaz aparte para
        // que el muestreo manual conserve su comportamiento y para que el job no pueda caer en un
        // pase alternativo cuando el buzón no anuncia etiquetas de Gmail.
        services.AddOptions<EmailIngestOptions>()
            .Bind(configuration.GetSection(EmailIngestOptions.SectionName));
        services.AddScoped<IImapDailyMailboxSource>(provider => provider.GetRequiredService<ImapMailboxSource>());

        // El cursor es singleton y en memoria: una sola cuenta configurada, sin tabla ni esquema.
        // Un reinicio puede releer correo ya visto, y eso es seguro porque solo se agregan etiquetas
        // existentes de forma idempotente.
        services.AddSingleton<EmailIngestCursor>();
        services.AddScoped<IEmailIngestRunner, EmailIngestRunner>();
        services.AddHostedService<EmailIngestBackgroundService>();

        // Los planes de aplicar viven en memoria, acotados a 200 y 15 minutos. Singleton porque el
        // token emitido por la vista previa se canjea en otra petición; TimeProvider para que la
        // caducidad sea comprobable sin esperar.
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<EmailApplyPlanStore>();
        services.AddScoped<EmailApplyService>();

        return services;
    }
}
