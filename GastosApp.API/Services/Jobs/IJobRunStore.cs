namespace GastosApp.API.Services.Jobs;

/// <summary>Datos con los que se abre una corrida. La fila se escribe antes de ejecutar.</summary>
/// <param name="JobKey">Clave del catálogo.</param>
/// <param name="Trigger"><c>automatic</c> o <c>manual</c>.</param>
/// <param name="RequestedBy">Usuario que pidió una corrida manual; nulo en las automáticas.</param>
/// <param name="StartedAtUtc">Instante de apertura, tomado del <see cref="TimeProvider"/>.</param>
public sealed record JobRunCreate(
    string JobKey,
    string Trigger,
    string? RequestedBy,
    DateTimeOffset StartedAtUtc);

/// <summary>Cierre de una corrida. El estado no puede ser <c>running</c>.</summary>
public sealed record JobRunCompletion(
    int JobRunId,
    string Status,
    int ItemsProcessed,
    int ItemsFailed,
    string? OutcomeCode,
    string? FailureType,
    DateTimeOffset FinishedAtUtc);

/// <summary>
/// Persistencia del historial de corridas. Es una interfaz aparte del coordinador para que la
/// decisión de "no ejecutar sin historial" se pueda probar sin base de datos.
/// </summary>
public interface IJobRunStore
{
    /// <summary>Abre la corrida y devuelve su id. Si lanza, el trabajo no debe ejecutarse.</summary>
    Task<int> CreateRunningAsync(JobRunCreate creation, CancellationToken cancellationToken);

    /// <summary>Cierra la corrida. Si lanza, el coordinador libera el job y lo registra.</summary>
    Task CompleteAsync(JobRunCompletion completion, CancellationToken cancellationToken);

    /// <summary>
    /// Marca como <c>interrupted</c> las corridas que quedaron abiertas por un proceso anterior y
    /// devuelve cuántas eran. Se ejecuta antes que cualquier corrida nueva.
    /// </summary>
    Task<int> MarkRunningAsInterruptedAsync(CancellationToken cancellationToken);
}
