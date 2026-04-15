using System.ComponentModel.DataAnnotations.Schema;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("category_tags")]
    public class CategoryTag
    {
        [Column("category_id")]
        public int CategoryId { get; set; }

        [Column("tag_id")]
        public int TagId { get; set; }

        [ForeignKey(nameof(CategoryId))]
        public virtual Category Category { get; set; } = null!;

        [ForeignKey(nameof(TagId))]
        public virtual Tag Tag { get; set; } = null!;
    }
}
