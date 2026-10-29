using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Borrador de gasto nacido de un correo. Mismo contrato que <see cref="TelegramDraft"/>: los
    /// campos capturables son nulos hasta que alguien los completa y confirma, así que un correo con
    /// datos parciales nunca deja de ser un borrador. No escribe en <c>transactions</c> por sí solo.
    /// </summary>
    [Table("email_expense_drafts")]
    public class EmailExpenseDraft : BaseModel
    {
        [Key]
        [Column("draft_id")]
        public Guid DraftId { get; set; } = Guid.NewGuid();

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        /// <summary>Un correo produce como mucho un borrador (índice único en la base).</summary>
        [Column("email_message_id")]
        [Required]
        public long EmailMessageId { get; set; }

        [Column("status")]
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = EmailExpenseDraftStatus.Pending;

        [Column("intent")]
        [Required]
        [StringLength(20)]
        public string Intent { get; set; } = EmailExpenseDraftIntent.Expense;

        [Column("amount", TypeName = "decimal(15,2)")]
        public decimal? Amount { get; set; }

        [Column("currency_code")]
        [StringLength(3)]
        public string? CurrencyCode { get; set; }

        [Column("transaction_date", TypeName = "timestamp with time zone")]
        public DateTime? TransactionDate { get; set; }

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

        /// <summary>
        /// Tarjeta con la que se pagó, tal como la dice el correo. Con PayPal el gasto vive en la
        /// tarjeta de fondo y hay tarjetas que no son cuentas de la app: el texto se conserva aquí
        /// para no perder el dato mientras no exista un catálogo de tarjetas.
        /// </summary>
        [Column("raw_card_name")]
        [StringLength(150)]
        public string? RawCardName { get; set; }

        [Column("raw_category_name")]
        [StringLength(150)]
        public string? RawCategoryName { get; set; }

        [Column("raw_merchant_name")]
        [StringLength(150)]
        public string? RawMerchantName { get; set; }

        [Column("description")]
        [StringLength(500)]
        public string? Description { get; set; }

        /// <summary>Quién extrajo los datos: <c>rule</c>, <c>llm</c> o <c>none</c>.</summary>
        [Column("extraction_source")]
        [Required]
        [StringLength(20)]
        public string ExtractionSource { get; set; } = EmailClassificationSource.None;

        [Column("expires_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime ExpiresAt { get; set; }

        [Column("confirmed_at", TypeName = "timestamp with time zone")]
        public DateTime? ConfirmedAt { get; set; }

        [Column("transaction_id")]
        public int? TransactionId { get; set; }

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        [ForeignKey("EmailMessageId")]
        public virtual EmailMessage EmailMessage { get; set; } = null!;

        [ForeignKey("TransactionId")]
        public virtual Transaction? Transaction { get; set; }
    }

    public static class EmailExpenseDraftStatus
    {
        public const string Pending = "pending";
        public const string Confirmed = "confirmed";
        public const string Discarded = "discarded";
        public const string Expired = "expired";
    }

    public static class EmailExpenseDraftIntent
    {
        public const string Expense = "expense";
        public const string Income = "income";
    }
}
