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
    /// <see cref="Negated" /> invierte el resultado del grupo ya combinado —no el de cada hijo—, que es
    /// lo que hace <c>dominio = x Y NO (asunto contiene factura O invoice)</c>. Es un booleano y no un
    /// comparador nuevo: «no_contiene», «no_empieza_con» y sus combinaciones son el camino a un motor
    /// que ya nadie puede auditar.
    /// </para>
    /// <para>
    /// Un grupo vacío nunca casa, y negarlo tampoco lo enciende. Es deliberado: una regla a medio
    /// configurar no debe comportarse como comodín y quedarse con correo que no le toca.
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

        /// <summary>
        /// Invierte el resultado del grupo. Arranca en <c>false</c> para que las reglas existentes
        /// sigan significando exactamente lo mismo que antes de S14.
        /// </summary>
        [Column("negated")]
        public bool Negated { get; set; }

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
