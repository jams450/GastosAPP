using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Una condición dentro de un grupo de regla: campo, comparación y valor. Todas las condiciones de
    /// un grupo se combinan con el operador del grupo, y los subgrupos entran en esa misma combinación.
    /// </summary>
    [Table("email_rule_conditions")]
    public class EmailRuleCondition : BaseModel
    {
        [Key]
        [Column("condition_id")]
        public int ConditionId { get; set; }

        [Column("group_id")]
        [Required]
        public int GroupId { get; set; }

        /// <summary>sender | sender_domain | subject</summary>
        [Column("match_field")]
        [Required]
        [StringLength(20)]
        public string MatchField { get; set; } = EmailRuleMatchField.Sender;

        /// <summary>equals | contains | starts_with | ends_with</summary>
        [Column("match_type")]
        [Required]
        [StringLength(20)]
        public string MatchType { get; set; } = EmailRuleMatchType.Contains;

        /// <summary>Valor ya normalizado (minúsculas, sin acentos, espacios colapsados).</summary>
        [Column("match_value")]
        [Required]
        [StringLength(200)]
        public string MatchValue { get; set; } = string.Empty;

        [ForeignKey("GroupId")]
        public virtual EmailRuleGroup Group { get; set; } = null!;
    }
}
