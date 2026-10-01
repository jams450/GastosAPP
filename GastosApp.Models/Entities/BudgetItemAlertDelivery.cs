using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Entrega de alerta de una partida planificada. La fila es el candado de idempotencia
    /// (<c>UNIQUE (item_id, alert_kind, period_key)</c>): una alerta por partida, tipo y periodo.
    /// El <see cref="UserId"/> es dato de la partida y no participa en resolver el destino del envío.
    /// </summary>
    [Table("budget_item_alert_deliveries")]
    public class BudgetItemAlertDelivery : BaseModel
    {
        [Key]
        [Column("delivery_id")]
        public int DeliveryId { get; set; }

        [Column("item_id")]
        [Required]
        public int ItemId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        [Column("period_key", TypeName = "char(7)")]
        [Required]
        [StringLength(7)]
        public string PeriodKey { get; set; } = string.Empty;

        /// <summary><c>due_today</c>, <c>overdue</c> o <c>unexecuted_month_end</c>.</summary>
        [Column("alert_kind")]
        [Required]
        [StringLength(20)]
        public string AlertKind { get; set; } = BudgetItemAlertKind.DueToday;

        /// <summary>Snapshot del monto planificado al momento de la alerta.</summary>
        [Column("planned_amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal PlannedAmount { get; set; }

        /// <summary>FK con <c>ON DELETE CASCADE</c>: sin la partida, su historial de alertas no significa nada.</summary>
        [ForeignKey("ItemId")]
        public virtual BudgetItem Item { get; set; } = null!;

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
    }

    public static class BudgetItemAlertKind
    {
        public const string DueToday = "due_today";
        public const string Overdue = "overdue";
        public const string UnexecutedMonthEnd = "unexecuted_month_end";
    }
}
