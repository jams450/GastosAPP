using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Entrega de alerta ya decidida. La fila es el candado de idempotencia
    /// (<c>UNIQUE (budget_id, threshold_id, period_key)</c>) y congela el estado financiero del momento.
    /// </summary>
    [Table("alert_deliveries")]
    public class AlertDelivery : BaseModel
    {
        [Key]
        [Column("delivery_id")]
        public int DeliveryId { get; set; }

        [Column("budget_id")]
        [Required]
        public int BudgetId { get; set; }

        /// <summary>FK a umbral con <c>ON DELETE RESTRICT</c>: preserva el historial de entregas.</summary>
        [Column("threshold_id")]
        [Required]
        public int ThresholdId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        [Column("period_key", TypeName = "char(7)")]
        [Required]
        [StringLength(7)]
        public string PeriodKey { get; set; } = string.Empty;

        /// <summary>Snapshot del porcentaje del umbral al momento de la entrega.</summary>
        [Column("threshold_percent", TypeName = "decimal(5,2)")]
        [Required]
        public decimal ThresholdPercent { get; set; }

        /// <summary>Snapshot del monto presupuestado al momento de la entrega.</summary>
        [Column("budget_amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal BudgetAmount { get; set; }

        /// <summary>Snapshot del gasto acumulado al momento de la entrega.</summary>
        [Column("spent_amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal SpentAmount { get; set; }

        [Column("percent_used", TypeName = "decimal(7,2)")]
        [Required]
        public decimal PercentUsed { get; set; }

        [ForeignKey("BudgetId")]
        public virtual Budget Budget { get; set; } = null!;

        [ForeignKey("ThresholdId")]
        public virtual BudgetThreshold Threshold { get; set; } = null!;

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        public virtual AlertOutbox? Outbox { get; set; }
    }
}
