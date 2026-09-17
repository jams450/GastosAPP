using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Umbral de consumo de un presupuesto. <see cref="Percent"/> puede superar 100 (sobregiro).
    /// </summary>
    [Table("budget_thresholds")]
    public class BudgetThreshold : BaseModel
    {
        [Key]
        [Column("threshold_id")]
        public int ThresholdId { get; set; }

        [Column("budget_id")]
        [Required]
        public int BudgetId { get; set; }

        [Column("name")]
        [Required]
        [StringLength(60)]
        public string Name { get; set; } = string.Empty;

        [Column("percent", TypeName = "decimal(5,2)")]
        [Required]
        public decimal Percent { get; set; }

        [Column("active")]
        public bool Active { get; set; } = true;

        [ForeignKey("BudgetId")]
        public virtual Budget Budget { get; set; } = null!;

        public virtual ICollection<AlertDelivery> Deliveries { get; set; } = new List<AlertDelivery>();
    }
}
