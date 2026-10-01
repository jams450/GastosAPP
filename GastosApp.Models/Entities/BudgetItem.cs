using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Partida planificada de un periodo (<c>yyyy-MM</c>). Es el plan declarado del mes, no el gasto real:
    /// el real se enlaza vía <see cref="TransactionId"/> cuando la partida se cumple.
    /// Alcance XOR: categoría <b>o</b> subcategoría. Sin rollover: cada periodo es una fila independiente.
    /// </summary>
    [Table("budget_items")]
    public class BudgetItem : BaseModel
    {
        [Key]
        [Column("item_id")]
        public int ItemId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        [Column("period_key", TypeName = "char(7)")]
        [Required]
        [StringLength(7)]
        public string PeriodKey { get; set; } = string.Empty;

        /// <summary>Tipo de la partida: <c>income</c> o <c>expense</c>.</summary>
        [Column("kind")]
        [Required]
        [StringLength(10)]
        public string Kind { get; set; } = string.Empty;

        [Column("name")]
        [Required]
        [StringLength(120)]
        public string Name { get; set; } = string.Empty;

        [Column("planned_amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal PlannedAmount { get; set; }

        /// <summary>Fecha esperada de la partida. Define la ventana de matching con la transacción real.</summary>
        [Column("planned_date", TypeName = "date")]
        [Required]
        public DateTime PlannedDate { get; set; }

        [Column("category_id")]
        public int? CategoryId { get; set; }

        [Column("subcategory_id")]
        public int? SubcategoryId { get; set; }

        /// <summary>Nula mientras no se asigne cuenta; alimenta el flujo proyectado cuando existe.</summary>
        [Column("account_id")]
        public int? AccountId { get; set; }

        [Column("merchant_id")]
        public int? MerchantId { get; set; }

        /// <summary>Plantilla de la que se generó la partida, si proviene de una recurrencia.</summary>
        [Column("recurring_item_id")]
        public int? RecurringItemId { get; set; }

        /// <summary><c>pending</c>, <c>executed</c>, <c>ignored</c> o <c>cancelled</c>.</summary>
        [Column("status")]
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = BudgetItemStatus.Pending;

        /// <summary>
        /// Cuota derivada de una recurrencia con monto promedio que <b>no</b> se confirmó este mes.
        /// Es el único desglose que no compromete dinero.
        /// </summary>
        [Column("is_projected")]
        public bool IsProjected { get; set; }

        /// <summary>Transacción que cumplió la partida. Se sostiene con <see cref="Status"/> executed.</summary>
        [Column("transaction_id")]
        public int? TransactionId { get; set; }

        /// <summary><c>manual</c> (capturada o ajustada a mano) o <c>template</c> (generada desde una recurrencia).</summary>
        [Column("source")]
        [Required]
        [StringLength(20)]
        public string Source { get; set; } = BudgetItemSource.Manual;

        [Column("notes")]
        [StringLength(300)]
        public string? Notes { get; set; }

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        [ForeignKey("CategoryId")]
        public virtual Category? Category { get; set; }

        [ForeignKey("SubcategoryId")]
        public virtual Subcategory? Subcategory { get; set; }

        [ForeignKey("AccountId")]
        public virtual Account? Account { get; set; }

        [ForeignKey("MerchantId")]
        public virtual Merchant? Merchant { get; set; }

        [ForeignKey("RecurringItemId")]
        public virtual RecurringItem? RecurringItem { get; set; }

        [ForeignKey("TransactionId")]
        public virtual Transaction? Transaction { get; set; }

        /// <summary>Historial de alertas de esta partida.</summary>
        public virtual ICollection<BudgetItemAlertDelivery> AlertDeliveries { get; set; } = new List<BudgetItemAlertDelivery>();
    }

    public static class BudgetItemStatus
    {
        public const string Pending = "pending";
        public const string Executed = "executed";
        public const string Ignored = "ignored";
        public const string Cancelled = "cancelled";
    }

    public static class BudgetItemSource
    {
        public const string Manual = "manual";
        public const string Template = "template";
    }
}
