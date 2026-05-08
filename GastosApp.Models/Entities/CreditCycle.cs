using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    [Table("credit_cycles")]
    public class CreditCycle : BaseModel
    {
        [Key]
        [Column("cycle_id")]
        public int CycleId { get; set; }

        [Column("account_id")]
        [Required]
        public int AccountId { get; set; }

        [Column("start_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime StartAt { get; set; }

        [Column("cutoff_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime CutoffAt { get; set; }

        [Column("due_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime DueAt { get; set; }

        [Column("opening_balance", TypeName = "decimal(15,2)")]
        public decimal OpeningBalance { get; set; }

        [Column("new_charges", TypeName = "decimal(15,2)")]
        public decimal NewCharges { get; set; }

        [Column("interests_fees", TypeName = "decimal(15,2)")]
        public decimal InterestsFees { get; set; }

        [Column("payments_until_cutoff", TypeName = "decimal(15,2)")]
        public decimal PaymentsUntilCutoff { get; set; }

        [Column("statement_balance", TypeName = "decimal(15,2)")]
        public decimal StatementBalance { get; set; }

        [Column("minimum_due", TypeName = "decimal(15,2)")]
        public decimal MinimumDue { get; set; }

        [Column("paid_by_due_date", TypeName = "decimal(15,2)")]
        public decimal PaidByDueDate { get; set; }

        [Column("remaining_by_due_date", TypeName = "decimal(15,2)")]
        public decimal RemainingByDueDate { get; set; }

        [Column("state")]
        [StringLength(20)]
        public string State { get; set; } = "Open";

        [ForeignKey("AccountId")]
        public virtual Account Account { get; set; } = null!;

        public virtual ICollection<CreditCharge> Charges { get; set; } = new List<CreditCharge>();
        public virtual ICollection<CreditInstallment> Installments { get; set; } = new List<CreditInstallment>();
    }
}
