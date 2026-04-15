using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("transactions")]
    public class Transaction : BaseModel
    {
        [Key]
        [Column("transaction_id")]
        public int TransactionId { get; set; }

        [Column("account_id")]
        [Required]
        public int AccountId { get; set; }

        [Column("category_id")]
        public int? CategoryId { get; set; }

        [Column("subcategory_id")]
        public int? SubcategoryId { get; set; }

        [Column("merchant_id")]
        public int? MerchantId { get; set; }

        [Column("type")]
        [Required]
        [StringLength(20)]
        public string Type { get; set; } = string.Empty;

        [Column("transfer_group_id")]
        public Guid? TransferGroupId { get; set; }

        [Column("amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal Amount { get; set; }

        [Column("description")]
        public string? Description { get; set; }

        [Column("transaction_date")]
        [Required]
        public DateTime TransactionDate { get; set; }

        [ForeignKey("AccountId")]
        public virtual Account Account { get; set; } = null!;

        [ForeignKey("CategoryId")]
        public virtual Category? Category { get; set; }

        [ForeignKey("SubcategoryId")]
        public virtual Subcategory? Subcategory { get; set; }

        [ForeignKey("MerchantId")]
        public virtual Merchant? Merchant { get; set; }

        public virtual ICollection<TransactionTag> TransactionTags { get; set; } = new List<TransactionTag>();
    }
}
