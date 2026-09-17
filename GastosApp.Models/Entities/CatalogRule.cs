using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Regla determinista de categorización. Aplica sobre texto normalizado y asigna
    /// exactamente un destino: categoría <b>o</b> subcategoría (XOR).
    /// </summary>
    [Table("catalog_rules")]
    public class CatalogRule : BaseModel
    {
        [Key]
        [Column("rule_id")]
        public int RuleId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        [Column("name")]
        [Required]
        [StringLength(120)]
        public string Name { get; set; } = string.Empty;

        [Column("match_type")]
        [Required]
        [StringLength(20)]
        public string MatchType { get; set; } = CatalogRuleMatchType.Contains;

        /// <summary>Valor de match ya normalizado (minúsculas, sin acentos, espacios colapsados).</summary>
        [Column("match_value")]
        [Required]
        [StringLength(200)]
        public string MatchValue { get; set; } = string.Empty;

        [Column("target_category_id")]
        public int? TargetCategoryId { get; set; }

        [Column("target_subcategory_id")]
        public int? TargetSubcategoryId { get; set; }

        /// <summary>Menor gana (0 = máxima prioridad); empate se resuelve por <see cref="RuleId"/>.</summary>
        [Column("priority")]
        public int Priority { get; set; } = 100;

        [Column("active")]
        public bool Active { get; set; } = true;

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        [ForeignKey("TargetCategoryId")]
        public virtual Category? TargetCategory { get; set; }

        [ForeignKey("TargetSubcategoryId")]
        public virtual Subcategory? TargetSubcategory { get; set; }
    }

    public static class CatalogRuleMatchType
    {
        public const string Contains = "contains";

        /// <summary>Coincidencia exacta del texto normalizado (valor persistido: <c>equals</c>).</summary>
        public const string Exact = "equals";

        public const string StartsWith = "starts_with";
    }
}
