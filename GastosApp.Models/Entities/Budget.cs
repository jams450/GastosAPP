using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Presupuesto mensual en MXN. Alcance XOR: categoría <b>o</b> subcategoría, nunca ambos ni ninguno.
    /// Sin rollover: cada <see cref="PeriodKey"/> (<c>yyyy-MM</c>) es una fila independiente.
    /// </summary>
    [Table("budgets")]
    public class Budget : BaseModel
    {
        [Key]
        [Column("budget_id")]
        public int BudgetId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        [Column("period_key", TypeName = "char(7)")]
        [Required]
        [StringLength(7)]
        public string PeriodKey { get; set; } = string.Empty;

        [Column("name")]
        [Required]
        [StringLength(120)]
        public string Name { get; set; } = string.Empty;

        [Column("category_id")]
        public int? CategoryId { get; set; }

        [Column("subcategory_id")]
        public int? SubcategoryId { get; set; }

        [Column("amount_mxn", TypeName = "decimal(15,2)")]
        [Required]
        public decimal AmountMxn { get; set; }

        [Column("active")]
        public bool Active { get; set; } = true;

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        [ForeignKey("CategoryId")]
        public virtual Category? Category { get; set; }

        [ForeignKey("SubcategoryId")]
        public virtual Subcategory? Subcategory { get; set; }

        public virtual ICollection<BudgetThreshold> Thresholds { get; set; } = new List<BudgetThreshold>();
    }
}
