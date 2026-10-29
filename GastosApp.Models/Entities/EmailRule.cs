using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Regla determinista de clasificación de correo. Aplica sobre un campo del mensaje y asigna
    /// exactamente una etiqueta. Misma forma que <see cref="CatalogRule" />, que ya está probada en
    /// este repo, más el campo que se compara.
    /// <para>
    /// La condición única de <see cref="MatchField" /> y compañía es el modelo anterior. Una regla puede
    /// expresar AND/OR anidados con <see cref="Groups" />, que es lo que cubre casos como «mismo dominio
    /// y el asunto empieza con X».
    /// </para>
    /// </summary>
    [Table("email_rules")]
    public class EmailRule : BaseModel
    {
        [Key]
        [Column("email_rule_id")]
        public int EmailRuleId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        [Column("name")]
        [Required]
        [StringLength(120)]
        public string Name { get; set; } = string.Empty;

        [Column("match_field")]
        [Required]
        [StringLength(20)]
        public string MatchField { get; set; } = EmailRuleMatchField.Sender;

        [Column("match_type")]
        [Required]
        [StringLength(20)]
        public string MatchType { get; set; } = EmailRuleMatchType.Contains;

        /// <summary>Valor de match ya normalizado (minúsculas, sin acentos, espacios colapsados).</summary>
        [Column("match_value")]
        [Required]
        [StringLength(200)]
        public string MatchValue { get; set; } = string.Empty;

        [Column("target_label_id")]
        [Required]
        public int TargetLabelId { get; set; }

        /// <summary>Menor gana (0 = máxima prioridad); el empate se resuelve por <see cref="EmailRuleId"/>.</summary>
        [Column("priority")]
        public int Priority { get; set; } = 100;

        [Column("active")]
        public bool Active { get; set; } = true;

        /// <summary>
        /// Correo del que nació la regla cuando se creó desde la bandeja de sin clasificar. Es
        /// trazabilidad, no una clave foránea: un correo puede purgarse sin llevarse la regla.
        /// </summary>
        [Column("created_from_message_id")]
        [StringLength(255)]
        public string? CreatedFromMessageId { get; set; }

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        [ForeignKey("TargetLabelId")]
        public virtual EmailLabel TargetLabel { get; set; } = null!;

        /// <summary>
        /// Grupos booleanos de la regla. Si está vacío, la regla se evalúa con sus columnas
        /// <c>match_*</c>, que es el modelo anterior y sigue vivo mientras dure la transición. Cuando
        /// hay grupos, mandan los grupos y las columnas se ignoran: dos fuentes de verdad para la misma
        /// condición es justo lo que se está retirando.
        /// </summary>
        public virtual ICollection<EmailRuleGroup> Groups { get; set; } = new List<EmailRuleGroup>();
    }

    public static class EmailRuleMatchField
    {
        /// <summary>Dirección completa del remitente.</summary>
        public const string Sender = "sender";

        /// <summary>Solo el dominio del remitente: «netflix.com» agrupa todas sus direcciones.</summary>
        public const string SenderDomain = "sender_domain";

        public const string Subject = "subject";
    }

    public static class EmailRuleMatchType
    {
        public const string Contains = "contains";

        /// <summary>Coincidencia exacta del texto normalizado (valor persistido: <c>equals</c>).</summary>
        public const string Exact = "equals";

        public const string StartsWith = "starts_with";

        /// <summary>
        /// Necesario para los avisos que no son cargos: el sufijo delata el tipo de correo cuando el
        /// remitente es el mismo que sí manda recibos.
        /// </summary>
        public const string EndsWith = "ends_with";
    }
}
