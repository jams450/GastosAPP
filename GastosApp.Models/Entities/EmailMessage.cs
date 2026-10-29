using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Un correo ya visto por el clasificador, con su veredicto. Es la memoria del pase: dice qué
    /// mensajes ya se procesaron y cuáles quedaron en la bandeja de revisión.
    /// <para>
    /// La clave de idempotencia es el <c>Message-ID</c> de RFC 822, no el UID de IMAP: un UID está
    /// calificado por <c>UIDVALIDITY</c> y se corre cuando el servidor lo cambia, así que sirve como
    /// pista de cursor y para nada más.
    /// </para>
    /// </summary>
    [Table("email_messages")]
    public class EmailMessage : BaseModel
    {
        [Key]
        [Column("email_message_id")]
        public long EmailMessageId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        /// <summary>Identificador RFC 822 del mensaje. Único por usuario.</summary>
        [Column("message_id")]
        [Required]
        [StringLength(255)]
        public string MessageId { get; set; } = string.Empty;

        /// <summary>Buzón o etiqueta de IMAP de donde se leyó.</summary>
        [Column("mailbox")]
        [Required]
        [StringLength(120)]
        public string Mailbox { get; set; } = string.Empty;

        /// <summary>Pista de cursor. No identifica nada por sí sola.</summary>
        [Column("uid")]
        public long? Uid { get; set; }

        [Column("sender_address")]
        [StringLength(320)]
        public string? SenderAddress { get; set; }

        [Column("sender_domain")]
        [StringLength(255)]
        public string? SenderDomain { get; set; }

        [Column("subject")]
        [StringLength(500)]
        public string? Subject { get; set; }

        [Column("received_at", TypeName = "timestamp with time zone")]
        [Required]
        public DateTime ReceivedAt { get; set; }

        /// <summary>
        /// Cuerpo ya extraído a texto y acotado por el esquema. Lo consume el extractor; no es el
        /// archivo del correo ni se conservan adjuntos.
        /// </summary>
        [Column("body_text")]
        public string? BodyText { get; set; }

        [Column("state")]
        [Required]
        [StringLength(20)]
        public string State { get; set; } = EmailMessageState.Pending;

        [Column("label_id")]
        public int? LabelId { get; set; }

        /// <summary>Regla que decidió, cuando decidió una regla. Nula si decidió el LLM o el default.</summary>
        [Column("matched_rule_id")]
        public int? MatchedRuleId { get; set; }

        [Column("classified_by")]
        [StringLength(10)]
        public string? ClassifiedBy { get; set; }

        [Column("attempt_count")]
        public int AttemptCount { get; set; }

        [Column("failure_reason")]
        [StringLength(500)]
        public string? FailureReason { get; set; }

        [Column("processed_at", TypeName = "timestamp with time zone")]
        public DateTime? ProcessedAt { get; set; }

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        [ForeignKey("LabelId")]
        public virtual EmailLabel? Label { get; set; }

        [ForeignKey("MatchedRuleId")]
        public virtual EmailRule? MatchedRule { get; set; }
    }

    public static class EmailMessageState
    {
        /// <summary>Leído del buzón y aún sin clasificar.</summary>
        public const string Pending = "pending";

        /// <summary>Clasificado sin producir borrador (etiqueta con comportamiento ignore o none).</summary>
        public const string Classified = "classified";

        /// <summary>Produjo un borrador pendiente de completar.</summary>
        public const string Drafted = "drafted";

        /// <summary>Sin regla que aplicara: espera en la bandeja de sin clasificar a que se cree una.</summary>
        public const string Review = "review";

        /// <summary>Antigüedad fuera de alcance o etiqueta de descarte explícita.</summary>
        public const string Ignored = "ignored";

        public const string Failed = "failed";
    }

    public static class EmailClassificationSource
    {
        public const string Rule = "rule";
        public const string Llm = "llm";
        public const string None = "none";
    }
}
