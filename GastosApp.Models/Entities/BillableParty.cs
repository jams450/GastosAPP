using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    [Table("billable_parties")]
    public class BillableParty : BaseModel
    {
        [Key]
        [Column("billable_party_id")]
        public int BillablePartyId { get; set; }

        [Column("owner_user_id")]
        [Required]
        public int OwnerUserId { get; set; }

        [Column("linked_user_id")]
        public int? LinkedUserId { get; set; }

        [Column("type")]
        [Required]
        [StringLength(30)]
        public string Type { get; set; } = "external_person";

        [Column("display_name")]
        [Required]
        [StringLength(120)]
        public string DisplayName { get; set; } = string.Empty;

        [Column("normalized_name")]
        [Required]
        [StringLength(120)]
        public string NormalizedName { get; set; } = string.Empty;

        [Column("active")]
        public bool Active { get; set; } = true;

        [Column("notes")]
        [StringLength(400)]
        public string? Notes { get; set; }

        [ForeignKey("OwnerUserId")]
        public virtual User OwnerUser { get; set; } = null!;

        [ForeignKey("LinkedUserId")]
        public virtual User? LinkedUser { get; set; }

        public virtual ICollection<TransactionAllocation> TransactionAllocations { get; set; } = new List<TransactionAllocation>();
    }
}
