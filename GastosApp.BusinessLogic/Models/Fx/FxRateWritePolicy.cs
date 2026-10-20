namespace GastosApp.BusinessLogic.Models.Fx;

/// <summary>
/// Decide si una tasa recién descargada debe escribirse, con la única regla que evita reescribir
/// historia: una tasa se agrega cuando la fecha es <b>nueva</b>, nunca cuando ya está cubierta.
/// </summary>
/// <remarks>
/// Es una función pura a propósito, para poder fijar los cuatro bordes que importan sin base de datos.
/// El job corre una vez al arrancar y otra cada día; sin esta regla, la corrida de arranque violaría la
/// clave primaria <c>(currency_code, rate_date)</c> o, peor, sobrescribiría una tasa ya publicada.
/// </remarks>
public static class FxRateWritePolicy
{
    /// <summary>
    /// <c>true</c> solo si la tasa descargada aporta una fecha posterior a la última almacenada.
    /// </summary>
    /// <param name="fetched">Tasa devuelta por el proveedor.</param>
    /// <param name="latestStoredDate">
    /// Fecha de la tasa más reciente ya guardada para esa divisa, o <c>null</c> si no hay ninguna.
    /// </param>
    public static bool ShouldWrite(FxRateFetchResult fetched, DateOnly? latestStoredDate)
    {
        ArgumentNullException.ThrowIfNull(fetched);

        // Sin historial: cualquier fecha publicada es información nueva.
        if (latestStoredDate is null)
        {
            return true;
        }

        // Igual: ya se sincronizó hoy. Anterior: publicación tardía de un día ya cubierto.
        return fetched.RateDate > latestStoredDate.Value;
    }
}
