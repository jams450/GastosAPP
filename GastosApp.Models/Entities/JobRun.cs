using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Una corrida de un job de la API: una fila por intento, escrita <b>antes</b> de ejecutar el
    /// trabajo y cerrada cuando termina (S1/L5).
    /// <para>
    /// Se escribe primero a propósito. La fila es lo que vuelve visible un job, y su ausencia es lo
    /// único que autoriza a no ejecutar: un trabajo sin historial sería un efecto secundario
    /// invisible, que es exactamente lo que este módulo existe para impedir.
    /// </para>
    /// <para>
    /// No hay FK a un catálogo de jobs: las cinco claves viven en el código
    /// (<c>JobKeys</c>) porque agregar un job no debe exigir una migración. El vocabulario que sí es
    /// fijo —<see cref="Status"/> y <see cref="Trigger"/>— está acotado por un CHECK en la base.
    /// </para>
    /// <para>
    /// <see cref="FailureType"/> es el <b>nombre del tipo</b> de la excepción o un código estable,
    /// nunca su mensaje: el historial se lee en una pantalla de administración y no debe arrastrar
    /// correo, credenciales, montos ni payloads.
    /// </para>
    /// </summary>
    [Table("job_runs")]
    public class JobRun : BaseModel
    {
        [Key]
        [Column("job_run_id")]
        public int JobRunId { get; set; }

        /// <summary>Clave estable del job. Ver <c>JobKeys</c> en la capa API.</summary>
        [Column("job_key")]
        [Required]
        [StringLength(60)]
        public string JobKey { get; set; } = string.Empty;

        /// <summary>Quién lo disparó: <c>automatic</c> (el horario) o <c>manual</c> (un administrador).</summary>
        [Column("trigger")]
        [Required]
        [StringLength(20)]
        public string Trigger { get; set; } = JobRunTrigger.Automatic;

        [Column("status")]
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = JobRunStatus.Running;

        [Column("started_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTimeOffset StartedAt { get; set; }

        /// <summary>Nulo mientras corre. Un job que corre no tiene hora de fin, y uno cerrado sí.</summary>
        [Column("finished_at", TypeName = "timestamp with time zone")]
        public DateTimeOffset? FinishedAt { get; set; }

        /// <summary>Usuario que pidió la corrida manual; nulo en las automáticas.</summary>
        [Column("requested_by")]
        [StringLength(100)]
        public string? RequestedBy { get; set; }

        /// <summary>Trabajo realizado, con el significado propio de cada job (ver su adaptador).</summary>
        [Column("items_processed")]
        public int ItemsProcessed { get; set; }

        /// <summary>Unidades que fallaron en esta corrida; distingue <c>partial</c> de <c>succeeded</c>.</summary>
        [Column("items_failed")]
        public int ItemsFailed { get; set; }

        /// <summary>Código estable del resultado (motivo de omisión, fallo parcial). Nunca texto libre.</summary>
        [Column("outcome_code")]
        [StringLength(60)]
        public string? OutcomeCode { get; set; }

        /// <summary>Tipo de excepción o código estable. Nunca el mensaje.</summary>
        [Column("failure_type")]
        [StringLength(100)]
        public string? FailureType { get; set; }
    }

    /// <summary>
    /// Estados de una corrida. <c>running</c> lo escribe el coordinador; el resto, el cierre.
    /// <para>
    /// <c>partial</c> existe separado de <c>succeeded</c> porque una corrida de tipos de cambio con
    /// una divisa caída <b>no</b> es un éxito: el usuario lo vería como tal y no investigaría.
    /// </para>
    /// </summary>
    public static class JobRunStatus
    {
        public const string Running = "running";
        public const string Succeeded = "succeeded";
        public const string Partial = "partial";
        public const string Failed = "failed";
        public const string Skipped = "skipped";
        public const string Interrupted = "interrupted";

        public static IReadOnlyList<string> All { get; } = new[]
        {
            Running,
            Succeeded,
            Partial,
            Failed,
            Skipped,
            Interrupted
        };

        /// <summary>Estados con los que una corrida puede cerrarse (nunca <c>running</c>).</summary>
        public static IReadOnlyList<string> Finished { get; } = new[]
        {
            Succeeded,
            Partial,
            Failed,
            Skipped,
            Interrupted
        };

        public static bool IsKnown(string? status) =>
            status is not null && All.Contains(status, StringComparer.Ordinal);
    }

    /// <summary>Origen de la corrida. Es lo que distingue un horario de una persona.</summary>
    public static class JobRunTrigger
    {
        public const string Automatic = "automatic";
        public const string Manual = "manual";

        public static IReadOnlyList<string> All { get; } = new[] { Automatic, Manual };

        public static bool IsKnown(string? trigger) =>
            trigger is not null && All.Contains(trigger, StringComparer.Ordinal);
    }
}
