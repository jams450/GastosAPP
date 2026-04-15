using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
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
        public bool Admin { get; set; } = true;

        public virtual ICollection<Account> Accounts { get; set; } = new List<Account>();
        public virtual ICollection<Category> Categories { get; set; } = new List<Category>();
        public virtual ICollection<Subcategory> Subcategories { get; set; } = new List<Subcategory>();
        public virtual ICollection<Merchant> Merchants { get; set; } = new List<Merchant>();
        public virtual ICollection<Tag> Tags { get; set; } = new List<Tag>();
    }
}
