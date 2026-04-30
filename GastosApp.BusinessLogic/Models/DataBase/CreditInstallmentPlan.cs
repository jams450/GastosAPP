using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("credit_installment_plans")]
    public class CreditInstallmentPlan : BaseModel
    {
        [Key]
        [Column("plan_id")]
        public int PlanId { get; set; }

        [Column("account_id")]
        [Required]
        public int AccountId { get; set; }

        [Column("source_charge_id")]
        [Required]
        public int SourceChargeId { get; set; }

        [Column("plan_type")]
        [StringLength(20)]
        public string PlanType { get; set; } = "Revolving";

        [Column("months")]
        public int Months { get; set; } = 1;

        [Column("principal_amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal PrincipalAmount { get; set; }

        [Column("monthly_amount_base", TypeName = "decimal(15,2)")]
        public decimal MonthlyAmountBase { get; set; }

        [Column("rounding_residual", TypeName = "decimal(15,2)")]
        public decimal RoundingResidual { get; set; }

        [Column("start_cycle_id")]
        public int? StartCycleId { get; set; }

        [Column("status")]
        [StringLength(20)]
        public string Status { get; set; } = "Active";

        [ForeignKey("AccountId")]
        public virtual Account Account { get; set; } = null!;

        [ForeignKey("SourceChargeId")]
        public virtual CreditCharge SourceCharge { get; set; } = null!;

        [ForeignKey("StartCycleId")]
        public virtual CreditCycle? StartCycle { get; set; }

        public virtual ICollection<CreditInstallment> Installments { get; set; } = new List<CreditInstallment>();
    }
}
