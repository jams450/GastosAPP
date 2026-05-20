using GastosApp.BusinessLogic.Context;
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

        return services;
    }
}
