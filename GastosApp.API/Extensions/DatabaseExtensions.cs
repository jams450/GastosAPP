using GastosApp.BusinessLogic.Context;
using GastosApp.BusinessLogic.Models.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.API.Extensions;

public static class DatabaseExtensions
{
    public static IServiceCollection AddApiDatabase(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

        services.AddDbContext<ContextSqlGastos>(options =>
            options.UseNpgsql(connectionString));

        // Bounds every command in the process. Non-positive values fall back to the default inside
        // the settings type, so a misconfigured 0 can never restore an unbounded wait.
        var commandTimeoutSeconds = configuration.GetValue(
            "Database:CommandTimeoutSeconds",
            DatabaseTimeoutSettings.DefaultCommandTimeoutSeconds);

        services.AddSingleton(new DatabaseTimeoutSettings { CommandTimeoutSeconds = commandTimeoutSeconds });

        return services;
    }
}
