using GastosApp.API.Services.Fx;
using GastosApp.BusinessLogic.Models.Fx;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the rule that keeps the daily sync from rewriting history, and the schedule that keeps it daily.
/// <para>
/// The job runs once at startup and again every day, so a rule based on "always insert" would collide
/// with the primary key <c>(currency_code, rate_date)</c>, and one based on "always update" would let a
/// late-published stale rate replace a newer one. Both are silent corruptions of financial data, which is
/// why these four edges are fixed without a database.
/// </para>
/// <para>
/// The schedule tests fix the edge that turns a daily job into a hot loop: when the target hour is
/// already behind us, the wait must be until tomorrow and never zero.
/// </para>
/// </summary>
public class FxRateSyncPolicyTests
{
    private static FxRateFetchResult Rate(DateOnly date) =>
        new("USD", 17.25m, date, "banxico");

    [Fact]
    public void Sin_historial_la_primera_tasa_se_escribe()
    {
        Assert.True(FxRateWritePolicy.ShouldWrite(Rate(new DateOnly(2026, 10, 19)), latestStoredDate: null));
    }

    [Fact]
    public void La_misma_fecha_no_se_reescribe()
    {
        var date = new DateOnly(2026, 10, 19);

        Assert.False(FxRateWritePolicy.ShouldWrite(Rate(date), latestStoredDate: date));
    }

    [Fact]
    public void Una_fecha_posterior_aporta_informacion_nueva()
    {
        Assert.True(FxRateWritePolicy.ShouldWrite(
            Rate(new DateOnly(2026, 10, 20)),
            latestStoredDate: new DateOnly(2026, 10, 19)));
    }

    [Fact]
    public void Una_publicacion_tardia_anterior_no_pisa_la_reciente()
    {
        Assert.False(FxRateWritePolicy.ShouldWrite(
            Rate(new DateOnly(2026, 10, 18)),
            latestStoredDate: new DateOnly(2026, 10, 19)));
    }

    [Fact]
    public void Antes_de_la_hora_objetivo_se_espera_el_mismo_dia()
    {
        var now = new DateTimeOffset(2026, 10, 19, 20, 0, 0, TimeSpan.Zero);

        Assert.Equal(TimeSpan.FromHours(2), FxSyncSchedule.DelayUntilNextRun(now, 22));
    }

    [Fact]
    public void Justo_en_la_hora_objetivo_se_espera_hasta_manana()
    {
        var now = new DateTimeOffset(2026, 10, 19, 22, 0, 0, TimeSpan.Zero);

        // Esperar cero aquí produciría un ciclo cerrado de descargas al proveedor.
        Assert.Equal(TimeSpan.FromHours(24), FxSyncSchedule.DelayUntilNextRun(now, 22));
    }

    [Fact]
    public void Despues_de_la_hora_objetivo_se_espera_hasta_manana()
    {
        var now = new DateTimeOffset(2026, 10, 19, 23, 30, 0, TimeSpan.Zero);

        Assert.Equal(TimeSpan.FromHours(22.5), FxSyncSchedule.DelayUntilNextRun(now, 22));
    }

    [Fact]
    public void La_medianoche_como_hora_objetivo_espera_un_dia_completo()
    {
        var now = new DateTimeOffset(2026, 10, 19, 0, 0, 0, TimeSpan.Zero);

        Assert.Equal(TimeSpan.FromDays(1), FxSyncSchedule.DelayUntilNextRun(now, 0));
    }
}
