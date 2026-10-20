using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities;

/// <summary>
/// Catálogo de monedas. Una sola fila con <see cref="IsBase"/> = <c>true</c>; todo se consolida a
/// esa moneda, y el índice único parcial de la base lo garantiza, no el código de aplicación.
/// </summary>
[Table("currencies")]
public class Currency : BaseModel
{
    [Key]
    [Column("code")]
    [StringLength(3)]
    public string Code { get; set; } = string.Empty;

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    /// <summary>Símbolo para mostrar. El formato usa la configuración regional y el código, nunca esto.</summary>
    [Column("symbol")]
    [StringLength(8)]
    public string Symbol { get; set; } = string.Empty;

    /// <summary>Decimales ISO 4217: el yen tiene 0, la mayoría 2. Gobierna el redondeo.</summary>
    [Column("decimals")]
    public short Decimals { get; set; } = 2;

    [Column("is_base")]
    public bool IsBase { get; set; }

    [Column("active")]
    public bool Active { get; set; } = true;
}
