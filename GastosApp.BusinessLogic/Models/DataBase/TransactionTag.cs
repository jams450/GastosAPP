using System.ComponentModel.DataAnnotations.Schema;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("transaction_tags")]
    public class TransactionTag
    {
        [Column("transaction_id")]
        public int TransactionId { get; set; }

        [Column("tag_id")]
        public int TagId { get; set; }

        [ForeignKey(nameof(TransactionId))]
        public virtual Transaction Transaction { get; set; } = null!;

        [ForeignKey(nameof(TagId))]
        public virtual Tag Tag { get; set; } = null!;
    }
}
