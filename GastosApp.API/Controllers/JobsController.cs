using GastosApp.API.Models.Jobs;
using GastosApp.API.Services.Jobs;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GastosApp.API.Controllers;

/// <summary>
/// Monitoreo administrativo de los jobs de la API y ejecución a demanda (S1/S2/S3).
/// <para>
/// Solo administradores: el historial es operativo —no financiero— pero la ejecución manual puede
/// avanzar cursores y ejecutar gastos programados, así que la decisión S2 es que únicamente un
/// administrador la dispare.
/// </para>
/// <para>
/// Una corrida manual responde <c>202</c> en cuanto la fila de historial existe. Nunca se espera al
/// job: el pase de correo puede tardar minutos y la petición no es dueña del trabajo. Por eso el
/// token que se pasa al coordinador es <see cref="CancellationToken.None"/>: cancelar la petición no
/// puede cancelar un trabajo ya confirmado, y una fila abierta que nunca se ejecute sería peor que
/// esperar.
/// </para>
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "AdminWithId")]
public class JobsController : ControllerBase
{
    private const string ConfirmationRequired = "confirmation_required";
    private const string UnknownJob = "unknown_job";
    private const string InvalidFilter = "invalid_filter";
    private const string AlreadyRunning = "already_running";
    private const string HistoryUnavailable = "history_unavailable";
    private const string ShuttingDown = "shutting_down";
    private const string RunNotFound = "not_found";

    private readonly IJobCatalog _catalog;
    private readonly IJobCoordinator _coordinator;
    private readonly IJobExecutionHost _executionHost;
    private readonly IJobRunQueryService _query;
    private readonly ICurrentUserService _currentUser;
    private readonly ILogger<JobsController> _logger;

    public JobsController(
        IJobCatalog catalog,
        IJobCoordinator coordinator,
        IJobExecutionHost executionHost,
        IJobRunQueryService query,
        ICurrentUserService currentUser,
        ILogger<JobsController> logger)
    {
        _catalog = catalog;
        _coordinator = coordinator;
        _executionHost = executionHost;
        _query = query;
        _currentUser = currentUser;
        _logger = logger;
    }

    /// <summary>Catálogo con estado del horario, última corrida, corrida en curso y conteos.</summary>
    [HttpGet]
    public async Task<IActionResult> GetJobs(CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _query.GetOverviewAsync(cancellationToken));
        }
        catch (Exception exception)
        {
            _logger.LogError("Error reading the job catalog: {ErrorType}", exception.GetType().Name);
            return StatusCode(500, Error("catalog_unavailable", "No se pudo leer el catálogo de jobs."));
        }
    }

    /// <summary>Historial paginado, opcionalmente acotado por job, estado y origen.</summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(
        [FromQuery] string? jobKey,
        [FromQuery] string? status,
        [FromQuery] string? trigger,
        [FromQuery] int? page,
        [FromQuery] int? pageSize,
        CancellationToken cancellationToken)
    {
        // La clave, el estado y el origen solo valen si están en el vocabulario conocido: un filtro
        // inventado devolvería una página vacía indistinguible de "no hay historial".
        if (jobKey is not null && !_catalog.TryGet(jobKey, out _))
        {
            return BadRequest(Error(InvalidFilter, "El job indicado no existe."));
        }

        if (status is not null && !JobRunStatus.IsKnown(status))
        {
            return BadRequest(Error(InvalidFilter, "El estado indicado no existe."));
        }

        if (trigger is not null && !JobRunTrigger.IsKnown(trigger))
        {
            return BadRequest(Error(InvalidFilter, "El origen indicado debe ser automatic o manual."));
        }

        var filter = new JobHistoryFilter(
            jobKey,
            status,
            trigger,
            JobHistoryQuery.NormalizePage(page),
            JobHistoryQuery.NormalizePageSize(pageSize));

        try
        {
            return Ok(await _query.GetHistoryAsync(filter, cancellationToken));
        }
        catch (Exception exception)
        {
            _logger.LogError("Error reading the job history: {ErrorType}", exception.GetType().Name);
            return StatusCode(500, Error("history_read_failed", "No se pudo leer el historial de jobs."));
        }
    }

    /// <summary>Detalle de una corrida.</summary>
    [HttpGet("{jobRunId:int}")]
    public async Task<IActionResult> GetRun(int jobRunId, CancellationToken cancellationToken)
    {
        try
        {
            var run = await _query.GetRunAsync(jobRunId, cancellationToken);

            return run is null
                ? NotFound(Error(RunNotFound, "La corrida indicada no existe."))
                : Ok(run);
        }
        catch (Exception exception)
        {
            _logger.LogError("Error reading job run {JobRunId}: {ErrorType}", jobRunId, exception.GetType().Name);
            return StatusCode(500, Error("history_read_failed", "No se pudo leer la corrida."));
        }
    }

    /// <summary>
    /// Ejecuta un job a demanda. Responde <c>202</c> con el id de la corrida ya abierta.
    /// </summary>
    /// <remarks>
    /// Se confirma explícitamente (S3) y el horario automático no estorba: apagarlo no prohíbe esta
    /// corrida. Sí se respetan el dueño configurado y las protecciones de negocio de cada job, que
    /// se reportan como <c>skipped</c> en el historial.
    /// </remarks>
    [HttpPost("{jobKey}/run")]
    public async Task<IActionResult> Run(
        string jobKey,
        [FromBody] RunJobRequest? request,
        CancellationToken cancellationToken)
    {
        if (!_catalog.TryGet(jobKey, out var definition))
        {
            return BadRequest(Error(UnknownJob, "El job indicado no existe."));
        }

        if (request is null || !request.Confirm)
        {
            return BadRequest(Error(
                ConfirmationRequired,
                "La ejecución manual exige confirmación explícita (confirm: true)."));
        }

        // Token nulo a propósito: la corrida no puede morir porque el cliente se desconecta.
        var begun = await _coordinator.TryBeginAsync(
            definition.Key,
            JobRunTrigger.Manual,
            RequestedBy(),
            CancellationToken.None);

        switch (begun.Status)
        {
            case JobBeginStatus.AlreadyRunning:
                return Conflict(new JobConflictResponse
                {
                    Code = AlreadyRunning,
                    Message = "El job ya está en ejecución.",
                    CurrentRunId = _coordinator.CurrentRunId(definition.Key)
                });

            case JobBeginStatus.HistoryUnavailable:
                // Sin fila de historial no se ejecuta nada: es la regla del módulo.
                return StatusCode(500, Error(
                    HistoryUnavailable,
                    "No se pudo registrar la corrida, así que el job no se ejecutó."));

            case JobBeginStatus.UnknownJob:
                return BadRequest(Error(UnknownJob, "El job indicado no existe."));
        }

        if (begun.Lease is not { } lease)
        {
            // Inalcanzable con el enum actual; se cubre para que un estado nuevo no produzca un 500
            // por referencia nula.
            return StatusCode(500, Error("unexpected_begin_state", "No se pudo abrir la corrida."));
        }

        if (!_executionHost.Start(token => _coordinator.RunAsync(lease, token)))
        {
            // El apagado ya empezó: cerrar la fila evita que quede "en curso" hasta el próximo
            // arranque, y el cliente sabe que no se ejecutó.
            await _coordinator.AbandonAsync(lease, JobRunStatus.Interrupted, CancellationToken.None);
            return StatusCode(503, Error(ShuttingDown, "La API se está apagando; la corrida no se ejecutó."));
        }

        return Accepted($"/api/jobs/{lease.JobRunId}", new ManualRunResponse
        {
            JobRunId = lease.JobRunId,
            JobKey = lease.JobKey,
            Trigger = JobRunTrigger.Manual,
            Status = JobRunStatus.Running,
            StartedAtUtc = lease.StartedAtUtc
        });
    }

    /// <summary>Correo del administrador que pidió la corrida; el nombre como respaldo.</summary>
    private string RequestedBy()
    {
        var email = _currentUser.GetEmail();

        return string.IsNullOrWhiteSpace(email) || email == "System" ? _currentUser.GetName() : email;
    }

    private static JobErrorResponse Error(string code, string message) => new() { Code = code, Message = message };
}
