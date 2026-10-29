using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    /// <summary>
    /// Etiqueta o carpeta propia del clasificador de correo. <b>No</b> es una etiqueta de Gmail: el
    /// clasificador lee el buzón y archiva aquí, sin escribir nada en el buzón del usuario.
    /// <para>
    /// El comportamiento vive en la etiqueta y no en su nombre. «Otros» es una etiqueta con
    /// <see cref="EmailLabelBehavior.None"/>, no un caso especial del motor: así el catch-all es
    /// dato, y cambiarlo no requiere tocar código.
    /// </para>
    /// </summary>
    [Table("email_labels")]
    public class EmailLabel : BaseModel
    {
        [Key]
        [Column("label_id")]
        public int LabelId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        [Column("name")]
        [Required]
        [StringLength(80)]
        public string Name { get; set; } = string.Empty;

        /// <summary>Identificador estable para semillas y reglas. Único por usuario.</summary>
        [Column("slug")]
        [Required]
        [StringLength(80)]
        public string Slug { get; set; } = string.Empty;

        /// <summary>
        /// Qué correo pertenece a esta etiqueta, en palabras del usuario. Es lo que el nombre no dice:
        /// «Banco» y «Gastos» se distinguen por su descripción, no por su título, y eso es justo lo que
        /// necesita el respaldo LLM para elegir entre etiquetas reales en vez de inventar una.
        /// <para>
        /// Es dato, nunca instrucción: se envía al modelo como definición de la etiqueta, junto a la
        /// misma regla que ya protege el cuerpo del correo.
        /// </para>
        /// </summary>
        [Column("description")]
        [StringLength(500)]
        public string? Description { get; set; }

        [Column("kind")]
        [Required]
        [StringLength(10)]
        public string Kind { get; set; } = EmailLabelKind.Label;

        /// <summary>Qué hace el motor cuando un correo cae en esta etiqueta.</summary>
        [Column("behavior")]
        [Required]
        [StringLength(10)]
        public string Behavior { get; set; } = EmailLabelBehavior.None;

        [Column("color")]
        [StringLength(7)]
        public string? Color { get; set; }

        /// <summary>Semilla del sistema: se puede renombrar y desactivar, pero no borrar.</summary>
        [Column("is_system")]
        public bool IsSystem { get; set; }

        [Column("sort_order")]
        public int SortOrder { get; set; } = 100;

        [Column("active")]
        public bool Active { get; set; } = true;

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
    }

    public static class EmailLabelKind
    {
        public const string Folder = "folder";
        public const string Label = "label";
    }

    public static class EmailLabelBehavior
    {
        /// <summary>Rutea al extractor: intenta crear un borrador de gasto.</summary>
        public const string Expense = "expense";

        /// <summary>Rutea al extractor con la intención invertida (reembolsos, devoluciones).</summary>
        public const string Income = "income";

        /// <summary>Descartado a propósito. Nunca entra al extractor ni a la bandeja de revisión.</summary>
        public const string Ignore = "ignore";

        /// <summary>Solo clasifica: ni borrador ni descarte. Es la etiqueta genérica.</summary>
        public const string None = "none";
    }
}
