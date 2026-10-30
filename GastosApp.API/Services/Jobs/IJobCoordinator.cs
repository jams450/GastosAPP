using GastosApp.Models.Entities;

namespace GastosApp.API.Services.Jobs;

/// <summary>
/// Una corrida ya abierta: la fila existe y el job está tomado en este proceso.
/// <para>
/// El id se asigna al insertar, así que la instancia se crea antes de conocerlo. El setter es
/// interno a propósito: solo el coordinador puede abrir y cerrar una corrida.
/// </para>
/// </summary>
public sealed class JobLease
{
    internal JobLease(string jobKey, DateTimeOffset startedAtUtc)
    {
        JobKey = jobKey;
        StartedAtUtc = startedAtUtc;
    }

    public string JobKey { get; }

    public DateTimeOffset StartedAtUtc { get; }

    public int JobRunId { get; internal set; }
}

/// <summary>Por qué una corrida no empezó.</summary>
public enum JobBeginStatus
{
    /// <summary>La fila existe y el job está tomado: hay que ejecutarlo o abandonarlo.</summary>
    Started,

    /// <summary>Ya hay una corrida de ese job en curso en este proceso (automática o manual).</summary>
    AlreadyRunning,

    /// <summary>La clave no está en el catálogo: no existe.</summary>
    UnknownJob,

    /// <summary>No se pudo escribir la fila de historial, así que no se ejecuta nada.</summary>
    HistoryUnavailable
}

/// <summary>Resultado de intentar abrir una corrida.</summary>
public sealed record JobBeginResult(JobBeginStatus Status, JobLease? Lease)
{
    public static JobBeginResult Started(JobLease lease) => new(JobBeginStatus.Started, lease);

    public static JobBeginResult AlreadyRunning { get; } = new(JobBeginStatus.AlreadyRunning, null);

    public static JobBeginResult UnknownJob { get; } = new(JobBeginStatus.UnknownJob, null);

    public static JobBeginResult HistoryUnavailable { get; } = new(JobBeginStatus.HistoryUnavailable, null);
}

/// <summary>
/// Coordinador de ejecuciones de este proceso (L5).
/// <para>
/// Cubre las corridas automáticas y las manuales con el <b>mismo</b> candado por job: mientras una
/// corre, la otra se rechaza. Un solo contenedor <c>api</c>, un solo candado en memoria, sin lock
/// distribuido; con varias réplicas esto dejaría de valer y habría que mover el candado a la base.
/// </para>
/// <para>
/// Antes de cualquier ejecución reconcilia el historial: las corridas que un proceso anterior dejó
/// en <c>running</c> pasan a <c>interrupted</c>. La garantía vive en la apertura y no en el orden de
/// arranque de los hosted services, porque un worker puede llegar aquí antes que cualquier paso de
/// arranque.
/// </para>
/// </summary>
public interface IJobCoordinator
{
    /// <summary>Reconcilia una sola vez; reintenta si el intento anterior falló. Nunca lanza.</summary>
    Task EnsureReconciledAsync(CancellationToken cancellationToken);

    /// <summary>Reconcilia sin caché. Devuelve las filas marcadas, o -1 si el historial falló.</summary>
    Task<int> ReconcileAsync(CancellationToken cancellationToken);

    Task<JobBeginResult> TryBeginAsync(
        string jobKey,
        string trigger,
        string? requestedBy,
        CancellationToken cancellationToken);

    /// <summary>Ejecuta la corrida y la cierra. Nunca lanza; devuelve lo que quedó registrado.</summary>
    Task<JobRunOutcome> RunAsync(JobLease lease, CancellationToken cancellationToken);

    /// <summary>Corrida automática completa (abrir, ejecutar, cerrar). No propaga fallos al worker.</summary>
    Task RunAutomaticAsync(string jobKey, CancellationToken cancellationToken);

    /// <summary>Cierra una corrida que no se va a ejecutar (apagado) y libera el job.</summary>
    Task AbandonAsync(JobLease lease, string status, CancellationToken cancellationToken);

    bool IsRunning(string jobKey);

    int? CurrentRunId(string jobKey);
}
