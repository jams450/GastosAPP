using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("credit_charges")]
    public class CreditCharge : BaseModel
    {
        [Key]
        [Column("charge_id")]
        public int ChargeId { get; set; }

        [Column("account_id")]
        [Required]
        public int AccountId { get; set; }

        [Column("source_transaction_id")]
        [Required]
        public int SourceTransactionId { get; set; }

        [Column("cycle_id")]
        public int? CycleId { get; set; }

        [Column("occurred_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime OccurredAt { get; set; }

        [Column("principal_amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal PrincipalAmount { get; set; }

        [Column("status")]
        [StringLength(20)]
        public string Status { get; set; } = "Open";

        [ForeignKey("AccountId")]
        public virtual Account Account { get; set; } = null!;

        [ForeignKey("SourceTransactionId")]
        public virtual Transaction SourceTransaction { get; set; } = null!;

        [ForeignKey("CycleId")]
        public virtual CreditCycle? Cycle { get; set; }

        public virtual CreditInstallmentPlan? InstallmentPlan { get; set; }
    }
}
