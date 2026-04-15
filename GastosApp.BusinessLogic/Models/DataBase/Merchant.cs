using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("merchants")]
    public class Merchant : BaseModel
    {
        [Key]
        [Column("merchant_id")]
        public int MerchantId { get; set; }

        [Column("user_id")]
        public int? UserId { get; set; }

        [Column("name")]
        [Required]
        [StringLength(120)]
        public string Name { get; set; } = string.Empty;

        [Column("normalized_name")]
        [Required]
        [StringLength(120)]
        public string NormalizedName { get; set; } = string.Empty;

        [Column("active")]
        public bool Active { get; set; } = true;

        [ForeignKey(nameof(UserId))]
        public virtual User? User { get; set; }

        public virtual ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
    }
}
