using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Grupo booleano de una regla de correo. Combina con su operador a sus condiciones y a sus
    /// subgrupos, así que una regla puede expresar
    /// <c>dominio = mercadolibre.com Y (asunto contiene compraste O asunto contiene pagaste)</c>.
    /// <para>
    /// Un grupo vacío nunca casa. Es deliberado: una regla a medio configurar no debe comportarse
    /// como comodín y quedarse con correo que no le toca.
    /// </para>
    /// </summary>
    [Table("email_rule_groups")]
    public class EmailRuleGroup : BaseModel
    {
        [Key]
        [Column("group_id")]
        public int GroupId { get; set; }

        [Column("email_rule_id")]
        [Required]
        public int EmailRuleId { get; set; }

        /// <summary>
        /// Nulo en el grupo raíz. Un índice único parcial en la base garantiza que haya uno solo por
        /// regla: dos raíces dejarían la regla sin un significado único.
        /// </summary>
        [Column("parent_group_id")]
        public int? ParentGroupId { get; set; }

        /// <summary>
        /// Se llama <c>combinator</c> y no <c>operator</c> porque OPERATOR es palabra reservada en
        /// PostgreSQL y obligaría a citarla en cada consulta.
        /// </summary>
        [Column("combinator")]
        [Required]
        [StringLength(3)]
        public string Combinator { get; set; } = EmailRuleGroupCombinator.And;

        [ForeignKey("EmailRuleId")]
        public virtual EmailRule EmailRule { get; set; } = null!;

        [ForeignKey("ParentGroupId")]
        public virtual EmailRuleGroup? ParentGroup { get; set; }

        public virtual ICollection<EmailRuleGroup> Children { get; set; } = new List<EmailRuleGroup>();

        public virtual ICollection<EmailRuleCondition> Conditions { get; set; } = new List<EmailRuleCondition>();
    }

    public static class EmailRuleGroupCombinator
    {
        public const string And = "and";
        public const string Or = "or";
    }
}
