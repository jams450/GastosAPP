using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Ledger durable de updates de Telegram para idempotencia entre reinicios.
    /// Sin <see cref="Models.BaseModel"/> a propósito: alto volumen y sin auditoría de usuario
    /// (el update llega anónimo); <c>claimed_at</c> actúa como lease, <c>claim_token</c> identifica
    /// al dueño vigente del lease y <c>attempt_count</c> permite reclaim controlado antes de
    /// descartar un update.
    /// </summary>
    [Table("telegram_processed_updates")]
    public class TelegramProcessedUpdate
    {
        [Key]
        [Column("update_id")]
        public long UpdateId { get; set; }

        [Column("telegram_identity_id")]
        public int? TelegramIdentityId { get; set; }

        [Column("status")]
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = TelegramProcessedUpdateStatus.Processing;

        [Column("attempt_count")]
        public int AttemptCount { get; set; }

        /// <summary>
        /// Token durable del lease vigente. Se regenera en cada claim/reclaim; solo el worker
        /// que lo posee puede cerrar el update (<c>MarkDone</c>/<c>MarkFailed</c>).
        /// </summary>
        [Column("claim_token")]
        [Required]
        public Guid ClaimToken { get; set; }

        [Column("claimed_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime ClaimedAt { get; set; }

        [Column("processed_at", TypeName = "timestamp with time zone")]
        public DateTime? ProcessedAt { get; set; }

        [ForeignKey("TelegramIdentityId")]
        public virtual TelegramIdentity? TelegramIdentity { get; set; }
    }

    public static class TelegramProcessedUpdateStatus
    {
        public const string Processing = "processing";
        public const string Done = "done";
        public const string Failed = "failed";
    }
}
