using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
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

        [Column("balance_impact", TypeName = "decimal(15,2)")]
        [Required]
        public decimal BalanceImpact { get; set; }

        [Column("direction")]
        [StringLength(10)]
        public string? Direction { get; set; }

        [Column("counterparty_account_id")]
        public int? CounterpartyAccountId { get; set; }

        [Column("description")]
        public string? Description { get; set; }

        [Column("transaction_date", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime TransactionDate { get; set; }

        /// <summary>
        /// Origen de la transacción: <c>manual</c> (capturada o importada) o <c>auto_recurring</c>
        /// (creada por el motor de gastos programados). Ver <see cref="TransactionOrigin"/>.
        /// </summary>
        [Column("origin")]
        [Required]
        [StringLength(20)]
        public string Origin { get; set; } = TransactionOrigin.Manual;

        /// <summary>Plantilla que generó la transacción cuando <see cref="Origin"/> es automático.</summary>
        [Column("origin_recurring_item_id")]
        public int? OriginRecurringItemId { get; set; }

        /// <summary>
        /// Verdadero cuando el ingreso es rendimiento de una cuenta que devenga interés.
        /// Solo clasifica: el saldo se mueve igual que cualquier otro ingreso, así que
        /// <see cref="Type"/> sigue siendo <c>income</c>.
        /// </summary>
        [Column("is_interest")]
        public bool IsInterest { get; set; }

        /// <summary>
        /// Divisa en que se capturó el movimiento. La consolidación usa <see cref="AmountMxn"/>, nunca
        /// <see cref="Amount"/>, porque comparar importes de divisas distintas no significa nada.
        /// </summary>
        [Column("currency_code")]
        [Required]
        [StringLength(3)]
        public string CurrencyCode { get; set; } = "MXN";

        /// <summary>
        /// Pesos por <b>una</b> unidad de <see cref="CurrencyCode"/>, congelados al capturar. Nulo en la
        /// divisa base: no se convierte contra sí misma y no existe una fecha de publicación que citar.
        /// Es editable, para que una tasa mal publicada o un ajuste acordado puedan corregirse.
        /// </summary>
        [Column("fx_rate", TypeName = "decimal(18,8)")]
        public decimal? FxRate { get; set; }

        /// <summary>
        /// Fecha de publicación de la tasa usada, no la de captura: es lo que permite ver que un gasto
        /// de domingo usó la tasa del viernes. Nula cuando no hay tasa.
        /// </summary>
        [Column("fx_rate_date")]
        public DateOnly? FxRateDate { get; set; }

        /// <summary>
        /// Importe consolidado en la divisa base: <c>round(Amount * FxRate, 2)</c>, o <c>Amount</c> exacto
        /// cuando la divisa es la base. Se fija al capturar y al editar; nunca se recalcula en lectura,
        /// porque re-resolver la tasa reescribiría meses ya cerrados.
        /// </summary>
        [Column("amount_mxn", TypeName = "decimal(15,2)")]
        [Required]
        public decimal AmountMxn { get; set; }

        [ForeignKey("AccountId")]
        public virtual Account Account { get; set; } = null!;

        [ForeignKey("CategoryId")]
        public virtual Category? Category { get; set; }

        [ForeignKey("SubcategoryId")]
        public virtual Subcategory? Subcategory { get; set; }

        [ForeignKey("MerchantId")]
        public virtual Merchant? Merchant { get; set; }

        /// <summary>Plantilla de programación que originó la transacción, si fue automática.</summary>
        [ForeignKey("OriginRecurringItemId")]
        public virtual RecurringItem? OriginRecurringItem { get; set; }

        public virtual ICollection<TransactionTag> TransactionTags { get; set; } = new List<TransactionTag>();
        public virtual ICollection<TransactionAllocation> TransactionAllocations { get; set; } = new List<TransactionAllocation>();
        public virtual CreditCharge? CreditCharge { get; set; }
        public virtual CreditPayment? CreditPayment { get; set; }
    }

    public static class TransactionOrigin
    {
        public const string Manual = "manual";
        public const string AutoRecurring = "auto_recurring";
    }
}
