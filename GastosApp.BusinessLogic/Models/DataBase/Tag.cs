using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("tags")]
    public class Tag : BaseModel
    {
        [Key]
        [Column("tag_id")]
        public int TagId { get; set; }

        [Column("user_id")]
        public int? UserId { get; set; }

        [Column("name")]
        [Required]
        [StringLength(80)]
        public string Name { get; set; } = string.Empty;

        [Column("normalized_name")]
        [Required]
        [StringLength(80)]
        public string NormalizedName { get; set; } = string.Empty;

        [Column("active")]
        public bool Active { get; set; } = true;

        [ForeignKey(nameof(UserId))]
        public virtual User? User { get; set; }

        public virtual ICollection<CategoryTag> CategoryTags { get; set; } = new List<CategoryTag>();
        public virtual ICollection<TransactionTag> TransactionTags { get; set; } = new List<TransactionTag>();
    }
}
