using System.Text;
using System.Text.Json.Serialization;
using GastosApp.API.Interfaces;
using GastosApp.API.Services;
using GastosApp.BusinessLogic.Context;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Services;
using GastosApp.Models.Interfaces;
using IPasswordService = GastosApp.BusinessLogic.Interfaces.IPasswordService;
using PasswordService = GastosApp.BusinessLogic.Services.PasswordService;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });
builder.Services.AddOpenApi();
builder.Services.AddHttpContextAccessor();

// Configure CORS
ConfigureCors(builder);

// Configure Database Connection
ConfigureDatabase(builder);

// Configure JWT Authentication
ConfigureJwtAuthentication(builder);

// Register application services
RegisterServices(builder.Services);

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("Production");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

static void ConfigureCors(WebApplicationBuilder builder)
{
    var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()?
        .Where(origin => !string.IsNullOrWhiteSpace(origin))
        .Select(origin => origin.Trim())
        .ToArray();

    if (allowedOrigins is null || allowedOrigins.Length == 0)
    {
        var allowedOriginsRaw = builder.Configuration["Cors:AllowedOrigins"];
        allowedOrigins = string.IsNullOrWhiteSpace(allowedOriginsRaw)
            ? Array.Empty<string>()
            : allowedOriginsRaw
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    if (allowedOrigins.Length == 0)
    {
        throw new InvalidOperationException("CORS AllowedOrigins not configured.");
    }
    
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("Production", policy =>
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        });
    });
}

static void ConfigureDatabase(WebApplicationBuilder builder)
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

    builder.Services.AddDbContext<ContextSqlGastos>(options =>
        options.UseNpgsql(connectionString));
}

static void ConfigureJwtAuthentication(WebApplicationBuilder builder)
{
    var jwtKey = builder.Configuration["Jwt:Key"] 
        ?? throw new InvalidOperationException("JWT Key not configured in appsettings.json");
    
    var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = builder.Configuration["Jwt:Issuer"],
                ValidAudience = builder.Configuration["Jwt:Audience"],
                IssuerSigningKey = securityKey,
                ClockSkew = TimeSpan.Zero
            };
        });

    builder.Services.AddAuthorization(options =>
    {
        options.AddPolicy("UserWithId", policy =>
            policy.RequireAuthenticatedUser()
                  .RequireAssertion(context =>
                  {
                      var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                          ?? context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

                      return int.TryParse(userIdClaim, out var userId) && userId >= 0;
                  }));

        options.AddPolicy("AdminWithId", policy =>
            policy.RequireAuthenticatedUser()
                  .RequireRole("Admin")
                  .RequireAssertion(context =>
                  {
                      var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                          ?? context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

                      return int.TryParse(userIdClaim, out var userId) && userId >= 0;
                  }));
    });
}

static void RegisterServices(IServiceCollection services)
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
    services.AddScoped<ITransactionService, TransactionService>();
    services.AddScoped<IDashboardService, DashboardService>();
}
