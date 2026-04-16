using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Models.DataBase
{
    [Table("accounts")]
    public class Account : BaseModel
    {
        [Key]
        [Column("account_id")]
        public int AccountId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        [Column("name")]
        [Required]
        [StringLength(100)]
        public string Name { get; set; } = string.Empty;

        [Column("color")]
        [StringLength(7)]
        public string Color { get; set; } = "#000000";

        [Column("active")]
        public bool Active { get; set; } = true;

        [Column("start_date")]
        [Required]
        public DateTime StartDate { get; set; }

        [Column("is_credit")]
        public bool IsCredit { get; set; } = false;

        [Column("due_day")]
        public int? DueDay { get; set; }

        [Column("payment_due_day")]
        public int? PaymentDueDay { get; set; }

        [Column("initial_balance", TypeName = "decimal(10,2)")]
        public decimal InitialBalance { get; set; } = 0.00m;

        [Column("current_balance", TypeName = "decimal(10,2)")]
        public decimal CurrentBalance { get; set; } = 0.00m;

        [Column("earns_interest")]
        public bool EarnsInterest { get; set; } = false;

        [Column("annual_interest_rate", TypeName = "decimal(5,2)")]
        public decimal AnnualInterestRate { get; set; } = 0.00m;

        [Column("credit_limit", TypeName = "decimal(10,2)")]
        public decimal? CreditLimit { get; set; }

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
        public virtual ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
    }
}
