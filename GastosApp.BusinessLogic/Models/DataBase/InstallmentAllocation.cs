using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("installment_allocations")]
    public class InstallmentAllocation : BaseModel
    {
        [Key]
        [Column("allocation_id")]
        public int AllocationId { get; set; }

        [Column("payment_id")]
        [Required]
        public int PaymentId { get; set; }

        [Column("installment_id")]
        [Required]
        public int InstallmentId { get; set; }

        [Column("allocated_amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal AllocatedAmount { get; set; }

        [ForeignKey("PaymentId")]
        public virtual CreditPayment Payment { get; set; } = null!;

        [ForeignKey("InstallmentId")]
        public virtual CreditInstallment Installment { get; set; } = null!;
    }
}
