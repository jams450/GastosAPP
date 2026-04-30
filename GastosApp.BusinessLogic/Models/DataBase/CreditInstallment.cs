using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("credit_installments")]
    public class CreditInstallment : BaseModel
    {
        [Key]
        [Column("installment_id")]
        public int InstallmentId { get; set; }

        [Column("plan_id")]
        [Required]
        public int PlanId { get; set; }

        [Column("installment_number")]
        [Required]
        public int InstallmentNumber { get; set; }

        [Column("due_cycle_id")]
        public int? DueCycleId { get; set; }

        [Column("due_date", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime DueDate { get; set; }

        [Column("principal_due", TypeName = "decimal(15,2)")]
        public decimal PrincipalDue { get; set; }

        [Column("interest_due", TypeName = "decimal(15,2)")]
        public decimal InterestDue { get; set; }

        [Column("fee_due", TypeName = "decimal(15,2)")]
        public decimal FeeDue { get; set; }

        [Column("total_due", TypeName = "decimal(15,2)")]
        [Required]
        public decimal TotalDue { get; set; }

        [Column("status")]
        [StringLength(20)]
        public string Status { get; set; } = "Open";

        [ForeignKey("PlanId")]
        public virtual CreditInstallmentPlan Plan { get; set; } = null!;

        [ForeignKey("DueCycleId")]
        public virtual CreditCycle? DueCycle { get; set; }

        public virtual ICollection<InstallmentAllocation> Allocations { get; set; } = new List<InstallmentAllocation>();
    }
}
