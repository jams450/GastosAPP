using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    [Table("users")]
    public class User : BaseModel
    {
        [Key]
        [Column("user_id")]
        public int UserId { get; set; }

        [Column("name")]
        [Required]
        [StringLength(100)]
        public string Name { get; set; } = string.Empty;

        [Column("email")]
        [Required]
        [StringLength(100)]
        public string Email { get; set; } = string.Empty;

        [Column("password")]
        [Required]
        [StringLength(255)]
        public string Password { get; set; } = string.Empty;

        [Column("active")]
        public bool Active { get; set; } = true;

        [Column("admin")]
        public bool Admin { get; set; } = false;

        [Column("session_version")]
        public int SessionVersion { get; set; } = 1;

        [Column("failed_login_count")]
        public int FailedLoginCount { get; set; } = 0;

        [Column("locked_until", TypeName = "timestamp with time zone")]
        public DateTime? LockedUntil { get; set; }

        public virtual ICollection<Account> Accounts { get; set; } = new List<Account>();
        public virtual ICollection<Category> Categories { get; set; } = new List<Category>();
        public virtual ICollection<Subcategory> Subcategories { get; set; } = new List<Subcategory>();
        public virtual ICollection<Merchant> Merchants { get; set; } = new List<Merchant>();
        public virtual ICollection<Tag> Tags { get; set; } = new List<Tag>();
        public virtual ICollection<BillableParty> OwnedBillableParties { get; set; } = new List<BillableParty>();
        public virtual ICollection<UserSession> Sessions { get; set; } = new List<UserSession>();
    }
}
