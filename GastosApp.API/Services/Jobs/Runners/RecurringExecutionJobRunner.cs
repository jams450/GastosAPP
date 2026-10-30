using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Jobs.Runners;

/// <summary>
/// Adaptador del motor de gastos programados (S1/L5). Mismo servicio, mismo dueño de Telegram y
/// misma cadencia que el worker.
/// <para>
/// La protección de negocio se conserva tal cual: sin salida de Telegram el motor no ejecuta nada y
/// deja las partidas pendientes. Eso no es un fallo, así que la corrida se registra como
/// <c>skipped</c> con su código; presentarlo como éxito escondería que no se ejecutó nada.
/// </para>
/// </summary>
public sealed class RecurringExecutionJobRunner : IJobRunner
{
    private readonly IRecurringItemService _recurringItemService;
    private readonly TelegramOptions _telegramOptions;
    private readonly ILogger<RecurringExecutionJobRunner> _logger;

    public RecurringExecutionJobRunner(
        IRecurringItemService recurringItemService,
        IOptions<TelegramOptions> telegramOptions,
        ILogger<RecurringExecutionJobRunner> logger)
    {
        _recurringItemService = recurringItemService;
        _telegramOptions = telegramOptions.Value;
        _logger = logger;
    }

    public string JobKey => JobKeys.RecurringExecution;

    public async Task<JobRunOutcome> RunAsync(CancellationToken cancellationToken)
    {
        // Alcance estricto: únicamente el AppUserId configurado. Sin dueño no se adivina.
        if (_telegramOptions.AppUserId <= 0)
        {
            return JobRunOutcome.Skipped("owner_missing");
        }

        var result = await _recurringItemService.ExecuteDueAsync(
            _telegramOptions.AppUserId,
            nowUtc: null,
            cancellationToken);

        // La decisión de no ejecutar sin salida de Telegram la toma el servicio: es la misma
        // validación que aplica al guardado y no se duplica aquí.
        if (result.ExecutionSkipped)
        {
            _logger.LogDebug("Recurring execution skipped: Telegram alerting is not available.");
            return JobRunOutcome.Skipped("telegram_unavailable");
        }

        if (result.Executed > 0 || result.Materialized > 0)
        {
            _logger.LogInformation(
                "Recurring execution: period {PeriodKey}, materialized {Materialized}, executed {Executed}, notices {Notices}.",
                result.PeriodKey,
                result.Materialized,
                result.Executed,
                result.NoticesQueued);
        }

        return JobRunOutcome.Succeeded(result.Materialized + result.Executed);
    }
}
