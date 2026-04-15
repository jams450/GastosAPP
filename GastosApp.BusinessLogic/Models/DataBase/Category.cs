using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("categories")]
    public class Category : BaseModel
    {
        [Key]
        [Column("category_id")]
        public int CategoryId { get; set; }

        [Column("user_id")]
        public int? UserId { get; set; }

        [Column("name")]
        [Required]
        [StringLength(100)]
        public string Name { get; set; } = string.Empty;

        [Column("color")]
        [StringLength(7)]
        public string Color { get; set; } = "#000000";

        [Column("type")]
        [StringLength(20)]
        public string Type { get; set; } = "expense";

        [Column("active")]
        public bool Active { get; set; } = true;

        [ForeignKey("UserId")]
        public virtual User? User { get; set; }
        public virtual ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
        public virtual ICollection<Subcategory> Subcategories { get; set; } = new List<Subcategory>();
        public virtual ICollection<CategoryTag> CategoryTags { get; set; } = new List<CategoryTag>();
    }
}
