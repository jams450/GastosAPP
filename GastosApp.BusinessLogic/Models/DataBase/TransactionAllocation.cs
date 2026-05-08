using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("transaction_allocations")]
    public class TransactionAllocation : BaseModel
    {
        [Key]
        [Column("transaction_allocation_id")]
        public int TransactionAllocationId { get; set; }

        [Column("transaction_id")]
        [Required]
        public int TransactionId { get; set; }

        [Column("billable_party_id")]
        [Required]
        public int BillablePartyId { get; set; }

        [Column("allocation_mode")]
        [Required]
        [StringLength(20)]
        public string AllocationMode { get; set; } = "percentage";

        [Column("allocation_value", TypeName = "decimal(15,4)")]
        [Required]
        public decimal AllocationValue { get; set; }

        [Column("calculated_amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal CalculatedAmount { get; set; }

        [Column("billable_party_snapshot_name")]
        [StringLength(120)]
        public string BillablePartySnapshotName { get; set; } = string.Empty;

        [ForeignKey("TransactionId")]
        public virtual Transaction Transaction { get; set; } = null!;

        [ForeignKey("BillablePartyId")]
        public virtual BillableParty BillableParty { get; set; } = null!;
    }
}
