using GastosApp.BusinessLogic.Context;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Infrastructure;
using GastosApp.BusinessLogic.Services;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the database command timeout for S4.
/// <para>
/// EF Core reads a command timeout of <c>0</c> as "no timeout at all", so a single
/// <c>SetCommandTimeout(0)</c> anywhere in the composition root turns every query in the process
/// into an unbounded wait. These checks hold the line on the value the repository actually applies,
/// because a stalled query that never returns is invisible to the caller's error handling: the
/// background workers catch exceptions, but they cannot catch a call that never comes back.
/// </para>
/// </summary>
public class DatabaseTimeoutTests
{
    private const string UnusedConnectionString =
        "Host=127.0.0.1;Port=5432;Database=timeout_probe;Username=probe;Password=probe;Timeout=1";

    [Fact]
    public void Repository_never_disables_the_command_timeout()
    {
        using var context = CreateContext();
        _ = new Repository(context, new DatabaseTimeoutSettings());

        var timeout = context.Database.GetCommandTimeout();

        Assert.NotNull(timeout);
        Assert.True(
            timeout > 0,
            $"The repository left the command timeout at {timeout}. EF Core treats 0 as no timeout, "
            + "so every query in the process would wait forever.");
    }

    [Fact]
    public void Repository_applies_the_configured_timeout()
    {
        using var context = CreateContext();
        _ = new Repository(context, new DatabaseTimeoutSettings { CommandTimeoutSeconds = 45 });

        Assert.Equal(45, context.Database.GetCommandTimeout());
    }

    [Fact]
    public void Default_settings_bound_the_timeout()
    {
        var settings = new DatabaseTimeoutSettings();

        Assert.Equal(DatabaseTimeoutSettings.DefaultCommandTimeoutSeconds, settings.CommandTimeoutSeconds);
        Assert.True(settings.EffectiveCommandTimeoutSeconds > 0);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(int.MinValue)]
    public void Non_positive_configuration_never_disables_the_timeout(int configured)
    {
        // The whole point of the settings type: a misconfigured 0 must not restore an unbounded wait.
        var settings = new DatabaseTimeoutSettings { CommandTimeoutSeconds = configured };

        Assert.Equal(DatabaseTimeoutSettings.DefaultCommandTimeoutSeconds, settings.EffectiveCommandTimeoutSeconds);

        using var context = CreateContext();
        _ = new Repository(context, settings);
        Assert.True(context.Database.GetCommandTimeout() > 0);
    }

    [Theory]
    [InlineData(int.MaxValue)]
    [InlineData(999_999)]
    public void An_effectively_unbounded_value_is_not_applied_verbatim(int configured)
    {
        // The finding was an unbounded wait. A value large enough to outlive the process is the same
        // failure wearing a number, so the guard cannot only reject values at or below zero.
        using var context = CreateContext();
        _ = new Repository(context, new DatabaseTimeoutSettings { CommandTimeoutSeconds = configured });

        var timeout = context.Database.GetCommandTimeout();

        Assert.NotNull(timeout);
        Assert.True(
            timeout <= 3600,
            $"A configured {configured} was applied as {timeout}, which is an unbounded wait in practice.");
    }

    /// <summary>
    /// Building the context does not open a connection: the Npgsql provider resolves the connection
    /// string lazily, so this probe stays offline and deterministic.
    /// </summary>
    private static ContextSqlGastos CreateContext()
    {
        var options = new DbContextOptionsBuilder<ContextSqlGastos>()
            .UseNpgsql(UnusedConnectionString)
            .Options;

        return new ContextSqlGastos(options, new AnonymousCurrentUser());
    }
}
