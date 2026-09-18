using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Borrador de gasto conversacional. Modelo "privado": solo referencia identidad y chat,
    /// nunca expone ni recibe un <c>user_id</c> propio (el usuario sale de <see cref="TelegramIdentity"/>).
    /// </summary>
    [Table("telegram_expense_drafts")]
    public class TelegramDraft : BaseModel
    {
        [Key]
        [Column("draft_id")]
        public Guid DraftId { get; set; } = Guid.NewGuid();

        [Column("telegram_identity_id")]
        [Required]
        public int TelegramIdentityId { get; set; }

        [Column("chat_id")]
        [Required]
        public long ChatId { get; set; }

        [Column("status")]
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = TelegramDraftStatus.Pending;

        [Column("intent")]
        [Required]
        [StringLength(20)]
        public string Intent { get; set; } = TelegramDraftIntent.Expense;

        [Column("amount", TypeName = "decimal(15,2)")]
        [Required]
        public decimal Amount { get; set; }

        [Column("transaction_date", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime TransactionDate { get; set; }

        [Column("account_id")]
        public int? AccountId { get; set; }

        [Column("category_id")]
        public int? CategoryId { get; set; }

        [Column("subcategory_id")]
        public int? SubcategoryId { get; set; }

        [Column("merchant_id")]
        public int? MerchantId { get; set; }

        [Column("raw_account_name")]
        [StringLength(150)]
        public string? RawAccountName { get; set; }

        [Column("raw_category_name")]
        [StringLength(150)]
        public string? RawCategoryName { get; set; }

        [Column("raw_subcategory_name")]
        [StringLength(150)]
        public string? RawSubcategoryName { get; set; }

        [Column("raw_merchant_name")]
        [StringLength(150)]
        public string? RawMerchantName { get; set; }

        [Column("description")]
        [StringLength(500)]
        public string? Description { get; set; }

        [Column("source")]
        [Required]
        [StringLength(20)]
        public string Source { get; set; } = TelegramDraftSource.Manual;

        [Column("expires_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime ExpiresAt { get; set; }

        [Column("confirmed_at", TypeName = "timestamp with time zone")]
        public DateTime? ConfirmedAt { get; set; }

        [Column("transaction_id")]
        public int? TransactionId { get; set; }

        [ForeignKey("TelegramIdentityId")]
        public virtual TelegramIdentity TelegramIdentity { get; set; } = null!;

        [ForeignKey("TransactionId")]
        public virtual Transaction? Transaction { get; set; }
    }

    public static class TelegramDraftStatus
    {
        public const string Pending = "pending";
        public const string Confirmed = "confirmed";
        public const string Cancelled = "cancelled";
        public const string Expired = "expired";
    }

    public static class TelegramDraftIntent
    {
        public const string Expense = "expense";
        public const string Income = "income";
    }

    public static class TelegramDraftSource
    {
        public const string Manual = "manual";
        public const string Ai = "ai";
    }
}
