using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Plantilla de lo que se repite cada mes (ingreso o gasto programado).
    /// <see cref="AmountMode"/> fijo exige <see cref="AmountMxn"/>; el modo promedio lo deja nulo
    /// y el monto se deriva del historial ejecutado. Alcance XOR: categoría <b>o</b> subcategoría.
    /// </summary>
    [Table("recurring_items")]
    public class RecurringItem : BaseModel
    {
        [Key]
        [Column("recurring_item_id")]
        public int RecurringItemId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        /// <summary>Tipo del movimiento: <c>income</c> o <c>expense</c>.</summary>
        [Column("kind")]
        [Required]
        [StringLength(10)]
        public string Kind { get; set; } = string.Empty;

        [Column("name")]
        [Required]
        [StringLength(120)]
        public string Name { get; set; } = string.Empty;

        /// <summary><c>fixed</c> (monto declarado) o <c>average</c> (promedio derivado del historial).</summary>
        [Column("amount_mode")]
        [Required]
        [StringLength(20)]
        public string AmountMode { get; set; } = RecurringItemAmountMode.Fixed;

        /// <summary>Nulo cuando <see cref="AmountMode"/> es promedio.</summary>
        [Column("amount_mxn", TypeName = "decimal(15,2)")]
        public decimal? AmountMxn { get; set; }

        /// <summary>Día del mes en que ocurre. Si el mes no tiene ese día, aplica el último día del mes.</summary>
        [Column("day_of_month")]
        [Required]
        public int DayOfMonth { get; set; }

        [Column("category_id")]
        public int? CategoryId { get; set; }

        [Column("subcategory_id")]
        public int? SubcategoryId { get; set; }

        /// <summary>Nula en plantillas que solo avisan: la ejecución automática exige cuenta asignada.</summary>
        [Column("account_id")]
        public int? AccountId { get; set; }

        [Column("merchant_id")]
        public int? MerchantId { get; set; }

        /// <summary>Primer periodo (<c>yyyy-MM</c>) en que la plantilla aplica.</summary>
        [Column("starts_period", TypeName = "char(7)")]
        [Required]
        [StringLength(7)]
        public string StartsPeriod { get; set; } = string.Empty;

        /// <summary>Último periodo (<c>yyyy-MM</c>) en que aplica; nulo = sin fin.</summary>
        [Column("ends_period", TypeName = "char(7)")]
        [StringLength(7)]
        public string? EndsPeriod { get; set; }

        [Column("active")]
        public bool Active { get; set; } = true;

        /// <summary>
        /// Materializa la transacción sin confirmación. Solo válido para gasto con cuenta asignada
        /// y con Telegram habilitado; se valida en el servicio, no en la base.
        /// </summary>
        [Column("auto_execute")]
        public bool AutoExecute { get; set; }

        /// <summary>
        /// Fecha de entrada en vigor decidida a mano. Nulo significa "sin forzar": rige
        /// <see cref="StartsPeriod"/>. Nunca puede ser anterior al inicio de ese periodo.
        /// </summary>
        [Column("effective_from", TypeName = "date")]
        public DateTime? EffectiveFrom { get; set; }

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

        /// <summary>Partidas generadas a partir de esta plantilla.</summary>
        public virtual ICollection<BudgetItem> BudgetItems { get; set; } = new List<BudgetItem>();
    }

    public static class RecurringItemAmountMode
    {
        public const string Fixed = "fixed";
        public const string Average = "average";
    }
}
