using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Outbox transaccional de alertas. <see cref="Payload"/> es dato financiero: solo DB,
    /// nunca se registra en logs ni se devuelve en errores.
    /// </summary>
    [Table("alert_outbox")]
    public class AlertOutbox : BaseModel
    {
        [Key]
        [Column("outbox_id")]
        public int OutboxId { get; set; }

        [Column("delivery_id")]
        public int? DeliveryId { get; set; }

        /// <summary>Dueño de la fila: dueño propio del outbox. Se usa para acotar la lectura por usuario
        /// sin depender de la entrega, que es nula en los avisos de partida y de ejecución automática.</summary>
        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        /// <summary>
        /// Fuente de la fila: <c>budget</c> (alerta de presupuesto), <c>budget_item</c> (alerta de
        /// partida) o <c>recurring_item</c> (aviso de ejecución automática). Ver <see cref="AlertOutboxSourceType"/>.
        /// </summary>
        [Column("source_type")]
        [Required]
        [StringLength(20)]
        public string SourceType { get; set; } = AlertOutboxSourceType.Budget;

        /// <summary>Id del registro origen según <see cref="SourceType"/>. Nulo en el camino de Fase 2.</summary>
        [Column("source_id")]
        public int? SourceId { get; set; }

        /// <summary>
        /// Discriminador de ocurrencia dentro de la fuente: <c>period_key</c> para presupuesto y
        /// recurrencia, <c>{period_key}:{alert_kind}</c> para partida. Sostiene la idempotencia
        /// del índice único parcial del outbox.
        /// </summary>
        [Column("source_key")]
        [StringLength(30)]
        public string? SourceKey { get; set; }

        [Column("channel")]
        [Required]
        [StringLength(20)]
        public string Channel { get; set; } = AlertOutboxChannel.Telegram;

        /// <summary>Texto ya renderizado; se congela al crear la entrega.</summary>
        [Column("payload")]
        [Required]
        public string Payload { get; set; } = string.Empty;

        [Column("status")]
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = AlertOutboxStatus.Pending;

        [Column("attempts")]
        public int Attempts { get; set; }

        [Column("next_attempt_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTimeOffset NextAttemptAt { get; set; }

        [Column("sent_at", TypeName = "timestamp with time zone")]
        public DateTimeOffset? SentAt { get; set; }

        [Column("last_error")]
        [StringLength(500)]
        public string? LastError { get; set; }

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        /// <summary>Entrega de presupuesto asociada. Nula en los avisos de partida y de ejecución automática.</summary>
        [ForeignKey("DeliveryId")]
        public virtual AlertDelivery? Delivery { get; set; }
    }

    public static class AlertOutboxChannel
    {
        public const string Telegram = "telegram";
    }

    public static class AlertOutboxStatus
    {
        public const string Pending = "pending";
        public const string Sent = "sent";
        public const string Failed = "failed";
    }

    public static class AlertOutboxSourceType
    {
        public const string Budget = "budget";
        public const string BudgetItem = "budget_item";
        public const string RecurringItem = "recurring_item";
    }
}
