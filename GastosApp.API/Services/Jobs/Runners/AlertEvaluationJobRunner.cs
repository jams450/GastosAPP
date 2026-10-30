using GastosApp.API.Configuration;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.Extensions.Options;

namespace GastosApp.API.Services.Jobs.Runners;

/// <summary>
/// Adaptador de la evaluación de alertas (S1/L5). Mismo servicio y mismo dueño de Telegram que el
/// worker; la idempotencia del servicio decide, así que repetir la corrida no duplica entregas.
/// </summary>
public sealed class AlertEvaluationJobRunner : IJobRunner
{
    private readonly IAlertEvaluationService _alertService;
    private readonly TelegramOptions _telegramOptions;
    private readonly ILogger<AlertEvaluationJobRunner> _logger;

    public AlertEvaluationJobRunner(
        IAlertEvaluationService alertService,
        IOptions<TelegramOptions> telegramOptions,
        ILogger<AlertEvaluationJobRunner> logger)
    {
        _alertService = alertService;
        _telegramOptions = telegramOptions.Value;
        _logger = logger;
    }

    public string JobKey => JobKeys.AlertEvaluation;

    public async Task<JobRunOutcome> RunAsync(CancellationToken cancellationToken)
    {
        // Alcance estricto: únicamente el AppUserId configurado.
        if (_telegramOptions.AppUserId <= 0)
        {
            return JobRunOutcome.Skipped("owner_missing");
        }

        var result = await _alertService.EvaluateAsync(_telegramOptions.AppUserId, cancellationToken);

        // Solo conteos: nunca montos, nombres ni payload. ItemAlertsCreated incluye las alertas de
        // partida (due_today / overdue / unexecuted_month_end), que de otro modo serían invisibles.
        if (result.AlertsCreated > 0 || result.ItemAlertsCreated > 0)
        {
            _logger.LogInformation(
                "Alert evaluation for period {PeriodKey}: {BudgetsEvaluated} budgets, {AlertsCreated} threshold alerts, {ItemsEvaluated} pending items, {ItemAlertsCreated} item alerts.",
                result.PeriodKey,
                result.BudgetsEvaluated,
                result.AlertsCreated,
                result.ItemsEvaluated,
                result.ItemAlertsCreated);
        }

        return JobRunOutcome.Succeeded(result.BudgetsEvaluated);
    }
}
