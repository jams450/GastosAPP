using GastosApp.API.Interfaces;
using GastosApp.API.Services;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Services;
using IPasswordService = GastosApp.BusinessLogic.Interfaces.IPasswordService;
using PasswordService = GastosApp.BusinessLogic.Services.PasswordService;

namespace GastosApp.API.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddApiApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<IJwtService, JwtService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IPasswordService, PasswordService>();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<IRepository, Repository>();
        services.AddScoped<IAccountService, AccountService>();
        services.AddScoped<ICategoryService, CategoryService>();
        services.AddScoped<ISubcategoryService, SubcategoryService>();
        services.AddScoped<IMerchantService, MerchantService>();
        services.AddScoped<ITagService, TagService>();
        services.AddScoped<IBillablePartyService, BillablePartyService>();
        services.AddScoped<ITransactionQueryService, TransactionQueryService>();
        services.AddScoped<ITransactionCommandService, TransactionCommandService>();
        services.AddScoped<ITransferService, TransferService>();
        services.AddScoped<ITransactionValidationService, TransactionValidationService>();
        services.AddScoped<ITransactionTagService, TransactionTagService>();
        services.AddScoped<IExpenseAllocationService, ExpenseAllocationService>();
        services.AddScoped<ICreditLifecycleService, CreditLifecycleService>();
        services.AddScoped<ITransactionService, TransactionService>();
        services.AddScoped<IBancoppelImportService, BancoppelImportService>();
        services.AddScoped<IDashboardService, DashboardService>();

        return services;
    }
}
