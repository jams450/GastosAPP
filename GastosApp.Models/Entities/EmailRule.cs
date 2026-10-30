using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Regla determinista de clasificación de correo. Aplica sobre un campo del mensaje y termina en
    /// una acción: asignar una etiqueta (el comportamiento histórico), mandar el correo a revisión o
    /// pedirlo al LLM. Misma forma que <see cref="CatalogRule" />, que ya está probada en este repo,
    /// más el campo que se compara y la acción terminal.
    /// <para>
    /// La condición única de <see cref="MatchField" /> y compañía es el modelo anterior. Una regla puede
    /// expresar AND/OR anidados con <see cref="Groups" />, que es lo que cubre casos como «mismo dominio
    /// y el asunto empieza con X».
    /// </para>
    /// <para>
    /// La acción vive en la regla y no en la etiqueta a propósito: «a este remitente no le asignes
    /// nada, mándalo a revisión» es una decisión de la regla, y colgarla del comportamiento de la
    /// etiqueta obligaría a inventar una etiqueta falsa para expresarla.
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

        /// <summary>
        /// Etiqueta destino. Nula en las acciones terminales (<c>review</c> y <c>llm</c>): una etiqueta
        /// ahí sería un destino que nadie aplica. La base exige la etiqueta solo para
        /// <c>assign_label</c> y la prohíbe en las demás, así que el modelo y el <c>CHECK</c> dicen lo
        /// mismo.
        /// </summary>
        [Column("target_label_id")]
        public int? TargetLabelId { get; set; }

        /// <summary>
        /// Acción terminal de la regla: <see cref="EmailRuleAction.AssignLabel" /> (histórica),
        /// <see cref="EmailRuleAction.Review" /> o <see cref="EmailRuleAction.Llm" />. La primera regla
        /// que casa decide y la evaluación se detiene, así que una acción terminal nunca cae a la
        /// siguiente regla.
        /// </summary>
        [Column("action")]
        [Required]
        [StringLength(20)]
        public string Action { get; set; } = EmailRuleAction.AssignLabel;

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

        /// <summary>Cantidad para el listado, sin cargar ni exponer el árbol completo.</summary>
        [NotMapped]
        public int ConditionCount { get; set; } = 1;

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        [ForeignKey("TargetLabelId")]
        public virtual EmailLabel? TargetLabel { get; set; }

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

    /// <summary>
    /// Acciones terminales de una regla. El valor persistido es el que viaja por la API y el que
    /// valida el <c>CHECK</c> de la base, así que la UI manda estos y no el nombre de la constante.
    /// </summary>
    public static class EmailRuleAction
    {
        /// <summary>Comportamiento histórico: la regla asigna <see cref="EmailRule.TargetLabelId" />.</summary>
        public const string AssignLabel = "assign_label";

        /// <summary>El correo se queda en la cola de revisión; no se etiqueta ni se extrae nada.</summary>
        public const string Review = "review";

        /// <summary>Se pide el veredicto al LLM; si el modelo falla o no está disponible, termina en revisión.</summary>
        public const string Llm = "llm";

        /// <summary>
        /// Normaliza el valor persistido. Vacío o nulo cae a <see cref="AssignLabel" /> porque las
        /// reglas anteriores a S15 no tienen la columna; un valor desconocido devuelve <c>null</c> y el
        /// motor lo trata como revisión. Degradar una acción desconocida a «asignar» la convertiría en
        /// una escritura sobre el buzón que nadie pidió.
        /// </summary>
        public static string? Normalize(string? action)
        {
            var value = (action ?? string.Empty).Trim().ToLowerInvariant();
            if (value.Length == 0)
            {
                return AssignLabel;
            }

            return value switch
            {
                AssignLabel => AssignLabel,
                Review => Review,
                Llm => Llm,
                _ => null
            };
        }
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
