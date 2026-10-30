using GastosApp.Models.Entities;

namespace GastosApp.API.Services.Jobs;

/// <summary>
/// Resultado de una corrida, tal como el job lo reporta al coordinador.
/// <para>
/// Los conteos son obligatorios y con semántica propia de cada job (correos aplicados, divisas
/// sincronizadas, presupuestos evaluados, avisos enviados, partidas ejecutadas). Existen porque
/// "terminó" no distingue una corrida parcial de un éxito: una sincronización con una divisa caída
/// reporta <see cref="Partial"/> y no <see cref="Succeeded"/>.
/// </para>
/// <para>
/// <see cref="FailureType"/> lleva el <b>tipo</b> de la excepción o un código estable, nunca el
/// mensaje. El estado <c>running</c> queda fuera a propósito: un job no puede cerrarse a sí mismo
/// como "todavía corriendo".
/// </para>
/// </summary>
public sealed record JobRunOutcome(
    string Status,
    int ItemsProcessed,
    int ItemsFailed,
    string? OutcomeCode,
    string? FailureType)
{
    public static JobRunOutcome Succeeded(int itemsProcessed, string? outcomeCode = null) =>
        new(JobRunStatus.Succeeded, itemsProcessed, 0, outcomeCode, null);

    public static JobRunOutcome Partial(int itemsProcessed, int itemsFailed, string? outcomeCode = null) =>
        new(JobRunStatus.Partial, itemsProcessed, itemsFailed, outcomeCode, null);

    /// <summary>El job decidió no trabajar, y eso no es un error: sin dueño, sin Telegram, sin correo nuevo.</summary>
    public static JobRunOutcome Skipped(string outcomeCode) =>
        new(JobRunStatus.Skipped, 0, 0, outcomeCode, null);

    public static JobRunOutcome Failed(string failureType, string? outcomeCode = null) =>
        new(JobRunStatus.Failed, 0, 0, outcomeCode, failureType);

    /// <summary>La corrida se cerró por apagado del proceso, no por un fallo del job.</summary>
    public static JobRunOutcome Interrupted(string outcomeCode) =>
        new(JobRunStatus.Interrupted, 0, 0, outcomeCode, null);
}
