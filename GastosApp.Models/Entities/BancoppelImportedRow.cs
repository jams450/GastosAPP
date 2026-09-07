using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    [Table("bancoppel_imported_rows")]
    public class BancoppelImportedRow : BaseModel
    {
        [Key]
        [Column("imported_row_id")]
        public int ImportedRowId { get; set; }

        [Column("account_id")]
        public int AccountId { get; set; }

        [Column("fingerprint")]
        [Required]
        [StringLength(64)]
        public string Fingerprint { get; set; } = string.Empty;

        [Column("transaction_id")]
        public int? TransactionId { get; set; }

        [ForeignKey("AccountId")]
        public virtual Account Account { get; set; } = null!;

        [ForeignKey("TransactionId")]
        public virtual Transaction? Transaction { get; set; }
    }
}
