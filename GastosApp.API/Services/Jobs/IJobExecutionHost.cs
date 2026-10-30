namespace GastosApp.API.Services.Jobs;

/// <summary>
/// Arranca trabajo en segundo plano atado a la <b>vida del host</b>, nunca al token de la petición
/// que lo pidió (S3/L5).
/// <para>
/// Existe porque la corrida manual responde <c>202</c> de inmediato: si el hilo de la petición fuera
/// el dueño del trabajo, cerrar la pestaña cancelaría un job que el usuario ya confirmó. Aquí el
/// token es el del apagado de la aplicación, y la tarea queda registrada para esperarla al cerrar.
/// </para>
/// </summary>
public interface IJobExecutionHost
{
    /// <summary>
    /// Arranca <paramref name="work"/> y devuelve <c>true</c>. Devuelve <c>false</c> cuando el
    /// apagado ya comenzó: el llamador debe cerrar su corrida en lugar de dejarla abierta.
    /// </summary>
    bool Start(Func<CancellationToken, Task> work);
}

/// <summary>
/// Host de ejecuciones desprendidas. Es un <see cref="BackgroundService"/> para recibir el token de
/// apagado del hosting y para esperar a las tareas en curso antes de terminar.
/// <para>
/// Dos reglas de seguridad del proceso: la tarea se guarda y se observa (una excepción que nadie
/// mira tumbaría el proceso al recolectarse la tarea), y su fallo se registra solo por tipo.
/// </para>
/// </summary>
public sealed class JobExecutionHost : BackgroundService, IJobExecutionHost
{
    /// <summary>
    /// Espera máxima al cerrar las corridas en curso. El historial de la base tiene su propio
    /// tiempo límite; pasado este, el apagado no se bloquea y la reconciliación del arranque
    /// siguiente cierra lo que falte.
    /// </summary>
    public static readonly TimeSpan ShutdownGrace = TimeSpan.FromSeconds(5);

    private readonly ILogger<JobExecutionHost> _logger;
    private readonly object _gate = new();
    private readonly List<Task> _inFlight = new();
    private CancellationToken _lifetimeToken;
    private bool _stopping;

    public JobExecutionHost(ILogger<JobExecutionHost> logger)
    {
        _logger = logger;
    }

    public bool Start(Func<CancellationToken, Task> work)
    {
        lock (_gate)
        {
            if (_stopping)
            {
                return false;
            }

            var token = _lifetimeToken;

            // Task.Run desprende del contexto de la petición; el token es el del host.
            var task = Task.Run(() => RunObservedAsync(work, token), CancellationToken.None);

            _inFlight.Add(task);

            // La continuación corre en el hilo de la tarea, así que se quita sola de la lista y
            // observa el resultado. `lock` es reentrante: si la tarea ya terminó, no hay bloqueo.
            _ = task.ContinueWith(
                finished =>
                {
                    lock (_gate)
                    {
                        _inFlight.Remove(finished);
                    }
                },
                CancellationToken.None,
                TaskContinuationOptions.ExecuteSynchronously,
                TaskScheduler.Default);

            return true;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Único punto donde se conoce el token de vida del host; las corridas arrancadas después lo
        // heredan. Antes de esta asignación solo se usa None, y ninguna petición llega tan temprano.
        lock (_gate)
        {
            _lifetimeToken = stoppingToken;
        }

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            // Apagado normal.
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        Task[] pending;

        lock (_gate)
        {
            _stopping = true;
            pending = _inFlight.ToArray();
        }

        // Cancela el token de vida: las corridas en curso se cierran como interrumpidas.
        await base.StopAsync(cancellationToken);

        if (pending.Length == 0)
        {
            return;
        }

        var all = Task.WhenAll(pending);

        if (await Task.WhenAny(all, Task.Delay(ShutdownGrace, CancellationToken.None)) != all)
        {
            _logger.LogWarning(
                "Shutdown waited {Seconds} seconds for {Count} detached job run(s) to close.",
                ShutdownGrace.TotalSeconds,
                pending.Length);
        }
    }

    /// <summary>
    /// Ejecuta el trabajo ya desprendido. El coordinador no lanza, así que esto es una segunda
    /// barrera: una excepción no observada en una tarea desprendida no debe poder matar el proceso.
    /// </summary>
    private async Task RunObservedAsync(Func<CancellationToken, Task> work, CancellationToken cancellationToken)
    {
        try
        {
            await work(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // Apagado.
        }
        catch (Exception exception)
        {
            _logger.LogError("Detached job run failed: {ErrorType}", exception.GetType().Name);
        }
    }
}
