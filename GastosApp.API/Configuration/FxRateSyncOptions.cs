namespace GastosApp.API.Configuration;

/// <summary>
/// Cadencia del job de tipos de cambio. Es independiente de <c>Banxico:Enabled</c> a propósito: las
/// divisas distintas de USD se sirven por Frankfurter, que no usa token, así que apagar Banxico no debe
/// apagar la sincronización completa.
/// </summary>
public sealed class FxRateSyncOptions
{
    public const string SectionName = "FxRates";

    /// <summary>Con <c>false</c> el job no arranca y no se descarga nada.</summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Hora UTC de la corrida diaria. 22 UTC equivale a las 16:00 de Ciudad de México en horario de
    /// verano, después de que Banxico publica el FIX del día. Se usa UTC para que un cambio de horario
    /// no desplace la corrida.
    /// </summary>
    public int SyncHourUtc { get; set; } = 22;
}
