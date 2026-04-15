using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("subcategories")]
    public class Subcategory : BaseModel
    {
        [Key]
        [Column("subcategory_id")]
        public int SubcategoryId { get; set; }

        [Column("user_id")]
        public int? UserId { get; set; }

        [Column("category_id")]
        [Required]
        public int CategoryId { get; set; }

        [Column("name")]
        [Required]
        [StringLength(100)]
        public string Name { get; set; } = string.Empty;

        [Column("normalized_name")]
        [Required]
        [StringLength(100)]
        public string NormalizedName { get; set; } = string.Empty;

        [Column("active")]
        public bool Active { get; set; } = true;

        [ForeignKey(nameof(UserId))]
        public virtual User? User { get; set; }

        [ForeignKey(nameof(CategoryId))]
        public virtual Category Category { get; set; } = null!;

        public virtual ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
    }
}
