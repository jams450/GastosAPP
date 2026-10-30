using GastosApp.Models.Entities;

namespace GastosApp.API.Models.Jobs;

/// <summary>
/// Una corrida tal como la lee la pantalla de administración.
/// <para>
/// No hay campos libres: <see cref="FailureType"/> es el nombre del tipo de la excepción o un código
/// estable, y <see cref="OutcomeCode"/> es un código del catálogo de cada job. Ni mensajes de error,
/// ni correo, ni credenciales, ni montos.
/// </para>
/// </summary>
public class JobRunSummaryResponse
{
    public int JobRunId { get; set; }

    public string JobKey { get; set; } = string.Empty;

    /// <summary><c>automatic</c> o <c>manual</c>.</summary>
    public string Trigger { get; set; } = string.Empty;

    /// <summary><c>running</c>, <c>succeeded</c>, <c>partial</c>, <c>failed</c>, <c>skipped</c> o <c>interrupted</c>.</summary>
    public string Status { get; set; } = string.Empty;

    public DateTimeOffset StartedAtUtc { get; set; }

    /// <summary>Nulo mientras corre.</summary>
    public DateTimeOffset? FinishedAtUtc { get; set; }

    /// <summary>Duración en milisegundos, o nula mientras corre.</summary>
    public long? DurationMs { get; set; }

    /// <summary>Usuario que pidió la corrida manual; nulo en las automáticas.</summary>
    public string? RequestedBy { get; set; }

    public int ItemsProcessed { get; set; }

    public int ItemsFailed { get; set; }

    /// <summary>Código estable del resultado (motivo de omisión, fallo parcial).</summary>
    public string? OutcomeCode { get; set; }

    /// <summary>Tipo de excepción o código estable; nunca el mensaje.</summary>
    public string? FailureType { get; set; }
}

/// <summary>Detalle de una corrida, con el nombre legible del job.</summary>
public class JobRunDetailResponse : JobRunSummaryResponse
{
    public string JobDisplayName { get; set; } = string.Empty;
}

/// <summary>Conteo de corridas por estado. <see cref="Total"/> es la suma.</summary>
public class JobStatusCountsResponse
{
    public int Running { get; set; }

    public int Succeeded { get; set; }

    public int Partial { get; set; }

    public int Failed { get; set; }

    public int Skipped { get; set; }

    public int Interrupted { get; set; }

    public int Total { get; set; }

    /// <summary>Suma un estado conocido; un estado desconocido se ignora en vez de romper la lectura.</summary>
    public void Add(string status, int count)
    {
        switch (status)
        {
            case JobRunStatus.Running:
                Running += count;
                break;
            case JobRunStatus.Succeeded:
                Succeeded += count;
                break;
            case JobRunStatus.Partial:
                Partial += count;
                break;
            case JobRunStatus.Failed:
                Failed += count;
                break;
            case JobRunStatus.Skipped:
                Skipped += count;
                break;
            case JobRunStatus.Interrupted:
                Interrupted += count;
                break;
            default:
                return;
        }

        Total += count;
    }
}

/// <summary>Horario del job, tal como lo describe el catálogo.</summary>
public class JobScheduleResponse
{
    /// <summary><c>daily</c>, <c>startup_daily</c> o <c>interval</c>.</summary>
    public string Kind { get; set; } = string.Empty;

    public int? HourUtc { get; set; }

    public int? IntervalSeconds { get; set; }

    public bool RunsAtStartup { get; set; }
}

/// <summary>Un job en el catálogo: identidad, estado del horario y sus corridas.</summary>
public class JobOverviewItemResponse
{
    public string JobKey { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    /// <summary>Estado del interruptor del horario automático. No afecta a la corrida manual.</summary>
    public bool AutomaticEnabled { get; set; }

    /// <summary>Clave de configuración que enciende el horario automático.</summary>
    public string AutomaticEnabledBy { get; set; } = string.Empty;

    /// <summary>Siempre <c>true</c>: apagar el horario no prohíbe la corrida a demanda.</summary>
    public bool ManualRunAllowed { get; set; }

    /// <summary>Dueño configurado, o nulo si el job no tiene dueño o falta configurarlo.</summary>
    public int? ConfiguredOwnerUserId { get; set; }

    /// <summary>Clave de configuración del dueño; nula cuando el job no tiene dueño configurable.</summary>
    public string? OwnerConfiguredBy { get; set; }

    public JobScheduleResponse Schedule { get; set; } = new();

    /// <summary>Nulo cuando el job está apagado o su horario es por intervalo (no es una hora de reloj).</summary>
    public DateTimeOffset? NextRunAtUtc { get; set; }

    /// <summary>La corrida en curso, si hay una en este proceso.</summary>
    public JobRunSummaryResponse? Current { get; set; }

    /// <summary>La última corrida cerrada.</summary>
    public JobRunSummaryResponse? Last { get; set; }

    public JobStatusCountsResponse Counts { get; set; } = new();
}

/// <summary>Catálogo completo con los conteos globales.</summary>
public class JobOverviewResponse
{
    public DateTimeOffset GeneratedAtUtc { get; set; }

    public List<JobOverviewItemResponse> Jobs { get; set; } = new();

    public JobStatusCountsResponse Totals { get; set; } = new();
}

/// <summary>
/// Una página del historial. La paginación no es cosmética: sin retención destructiva esta tabla
/// crece para siempre, y una lectura sin tope dejaría de responder.
/// </summary>
public class JobHistoryResponse
{
    public List<JobRunSummaryResponse> Items { get; set; } = new();

    public int Page { get; set; }

    public int PageSize { get; set; }

    public int TotalCount { get; set; }

    public int TotalPages { get; set; }
}

/// <summary>Respuesta de una corrida manual aceptada.</summary>
public class ManualRunResponse
{
    public int JobRunId { get; set; }

    public string JobKey { get; set; } = string.Empty;

    public string Trigger { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public DateTimeOffset StartedAtUtc { get; set; }
}

/// <summary>Error con código estable, para que el frontend no dependa del texto.</summary>
public class JobErrorResponse
{
    public string Code { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;
}

/// <summary>Conflicto de solapamiento: ya hay una corrida de ese job en curso.</summary>
public class JobConflictResponse : JobErrorResponse
{
    public int? CurrentRunId { get; set; }
}

/// <summary>
/// Cuerpo de una corrida manual. <see cref="Confirm"/> debe venir en <c>true</c>: la decisión S3 es
/// que ejecutar a demanda exige confirmación explícita, y un campo ausente no es una confirmación.
/// </summary>
public class RunJobRequest
{
    public bool Confirm { get; set; }

    /// <summary>Motivo opcional, para el registro del operador. No se guarda en el historial.</summary>
    public string? Reason { get; set; }
}
