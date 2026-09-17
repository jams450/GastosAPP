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
        [Required]
        public int DeliveryId { get; set; }

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

        [ForeignKey("DeliveryId")]
        public virtual AlertDelivery Delivery { get; set; } = null!;
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
}
