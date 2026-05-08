using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    [Table("credit_payments")]
    public class CreditPayment : BaseModel
    {
        [Key]
        [Column("payment_id")]
        public int PaymentId { get; set; }

        [Column("account_id")]
        [Required]
        public int AccountId { get; set; }

        [Column("source_transaction_id")]
        [Required]
        public int SourceTransactionId { get; set; }

        [Column("paid_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime PaidAt { get; set; }

        [Column("amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal Amount { get; set; }

        [Column("status")]
        [StringLength(20)]
        public string Status { get; set; } = "Posted";

        [ForeignKey("AccountId")]
        public virtual Account Account { get; set; } = null!;

        [ForeignKey("SourceTransactionId")]
        public virtual Transaction SourceTransaction { get; set; } = null!;

        public virtual ICollection<InstallmentAllocation> Allocations { get; set; } = new List<InstallmentAllocation>();
    }
}
