using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GastosApp.Models.Entities;

/// <summary>
/// Tipo de cambio en pesos por <b>una</b> unidad de <see cref="CurrencyCode"/>, en una fecha.
/// <para>
/// Guardar "pesos por unidad" y no "unidades por peso" elimina la ambigüedad de la tasa invertida:
/// convertir es siempre una multiplicación.
/// </para>
/// <para>
/// No hereda de <c>BaseModel</c> a propósito: una tasa no se edita, se reemplaza. Su procedencia vive
/// en <see cref="Source"/> y <see cref="FetchedAt"/>.
/// </para>
/// </summary>
[Table("fx_rates")]
public class FxRate
{
    [Column("currency_code")]
    [StringLength(3)]
    public string CurrencyCode { get; set; } = string.Empty;

    [Column("rate_date")]
    public DateOnly RateDate { get; set; }

    [Column("rate_mxn", TypeName = "decimal(18,8)")]
    public decimal RateMxn { get; set; }

    [Column("source")]
    [StringLength(24)]
    public string Source { get; set; } = FxRateSource.Banxico;

    [Column("fetched_at")]
    public DateTime FetchedAt { get; set; }

    public virtual Currency? Currency { get; set; }
}

/// <summary>
/// Vocabulario cerrado de procedencias. Vive aquí, y no como texto libre, para que una corrección manual
/// siga siendo distinguible de lo que descargó el job.
/// </summary>
public static class FxRateSource
{
    public const string Banxico = "banxico";
    public const string Manual = "manual";
}
