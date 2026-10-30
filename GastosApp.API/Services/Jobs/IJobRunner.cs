namespace GastosApp.API.Services.Jobs;

/// <summary>
/// Un job ejecutable por el coordinador. Cada implementación adapta un servicio de negocio que ya
/// existía; ninguna reimplementa su trabajo ni su validación.
/// <para>
/// El adaptador lee el dueño y la configuración de las mismas opciones que el worker, y <b>no</b>
/// consulta los interruptores de horario: apagar el horario automático no apaga la corrida a
/// demanda (S3). Las protecciones de negocio (sin dueño configurado, salida de Telegram no
/// disponible, buzón sin etiquetas) sí siguen aplicando, y se reportan como <c>skipped</c>.
/// </para>
/// </summary>
public interface IJobRunner
{
    /// <summary>Clave estable; debe existir en <see cref="JobKeys"/>.</summary>
    string JobKey { get; }

    /// <summary>
    /// Ejecuta una pasada. Puede lanzar: el coordinador registra el <b>tipo</b> de la excepción y
    /// cierra la corrida como <c>failed</c>.
    /// </summary>
    Task<JobRunOutcome> RunAsync(CancellationToken cancellationToken);
}
