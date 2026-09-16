using System.Globalization;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;

namespace GastosApp.API.Services.Telegram;

public sealed class TelegramToolService
{
    private const int CatalogLimit = 100;
    private readonly ITransactionQueryService _transactions;
    private readonly IAccountService _accounts;
    private readonly ICategoryService _categories;
    private readonly ISubcategoryService _subcategories;
    private readonly IMerchantService _merchants;
    private readonly ITagService _tags;
    private readonly IDashboardService _dashboard;

    public TelegramToolService(
        ITransactionQueryService transactions,
        IAccountService accounts,
        ICategoryService categories,
        ISubcategoryService subcategories,
        IMerchantService merchants,
        ITagService tags,
        IDashboardService dashboard)
    {
        _transactions = transactions;
        _accounts = accounts;
        _categories = categories;
        _subcategories = subcategories;
        _merchants = merchants;
        _tags = tags;
        _dashboard = dashboard;
    }

    // El userId siempre lo pasa el llamador (identidad persistida). Nunca sale de la configuración ni del LLM.
    public async Task<object> ResumenGastosAsync(ResumenGastosRequest request, int userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!TryParseDate(request.Desde, out var desde) || !TryParseDate(request.Hasta, out var hasta))
            return new ToolError("desde y hasta requeridos en formato yyyy-MM-dd.");
        if (desde > hasta) return new ToolError("desde no puede ser posterior a hasta.");

        var tipo = Normalize(request.Tipo, ["expense", "income", "transfer"]);
        if (request.Tipo is not null && tipo is null) return new ToolError("tipo debe ser expense, income o transfer.");
        var agruparPor = Normalize(request.AgruparPor, ["total", "categoria", "subcategoria", "cuenta", "comercio"]);
        agruparPor ??= Normalize(request.AgruparPor, ["dia", "mes"]);
        if (agruparPor is null) return new ToolError("agruparPor inválido.");

        var categoryId = await ResolveCategoryIdAsync(request.Categoria, tipo, userId, cancellationToken);
        if (categoryId.Error is not null) return new ToolError(categoryId.Error);
        var subcategoryId = await ResolveSubcategoryIdAsync(request.Subcategoria, userId, cancellationToken);
        if (subcategoryId.Error is not null) return new ToolError(subcategoryId.Error);
        var accountId = await ResolveAccountIdAsync(request.Cuenta, userId, cancellationToken);
        if (accountId.Error is not null) return new ToolError(accountId.Error);
        var merchantId = await ResolveMerchantIdAsync(request.Comercio, userId, cancellationToken);
        if (merchantId.Error is not null) return new ToolError(merchantId.Error);

        cancellationToken.ThrowIfCancellationRequested();
        var result = await _transactions.QueryAcrossAccountsForUserAsync(userId, new TransactionAggregateQuery
        {
            Desde = desde.ToDateTime(TimeOnly.MinValue),
            Hasta = hasta.ToDateTime(TimeOnly.MinValue),
            Type = tipo,
            CategoryId = categoryId.Id,
            SubcategoryId = subcategoryId.Id,
            AccountId = accountId.Id,
            MerchantId = merchantId.Id,
            GroupBy = agruparPor,
            Limit = Math.Clamp(request.Limite, 1, 50)
        });

        return new ResumenGastosResponse(
            result.TotalExpense,
            result.TotalIncome,
            result.GroupBy,
            result.Buckets.Select(x => new AggregateBucket(x.Key, x.Expense, x.Income, x.Count)).ToList());
    }

    public async Task<object> ListarCatalogosAsync(ListarCatalogosRequest request, int userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var tipo = Normalize(request.Tipo, ["cuentas", "categorias", "subcategorias", "comercios", "etiquetas"]);
        if (tipo is null) return new ToolError("tipo debe ser cuentas, categorias, subcategorias, comercios o etiquetas.");

        var items = tipo switch
        {
            "cuentas" => (await _accounts.GetAllActiveByUserIdAsync(userId)).Take(CatalogLimit).Select(x => new CatalogItem(x.AccountId, x.Name)),
            "categorias" => (await _categories.GetAllActiveByUserIdAsync(userId)).Take(CatalogLimit).Select(x => new CatalogItem(x.CategoryId, x.Name)),
            "subcategorias" => await ListSubcategoriesAsync(request.Categoria, userId, cancellationToken),
            "comercios" => (await _merchants.GetByUserIdAsync(userId, true)).Take(CatalogLimit).Select(x => new CatalogItem(x.MerchantId, x.Name)),
            "etiquetas" => (await _tags.GetByUserIdAsync(userId, true)).Take(CatalogLimit).Select(x => new CatalogItem(x.TagId, x.Name)),
            _ => []
        };
        return new CatalogResponse(items.ToList());
    }

    public async Task<object> ResumenDashboardAsync(ResumenDashboardRequest request, int userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!string.IsNullOrWhiteSpace(request.Mes) && !DateOnly.TryParseExact(request.Mes + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            return new ToolError("mes debe tener formato yyyy-MM.");

        var overview = await _dashboard.GetOverviewAsync(userId, request.Mes, "America/Mexico_City");
        return new DashboardResponse(
            overview.Month,
            overview.GeneralSummary.MonthIncome,
            overview.GeneralSummary.MonthExpense,
            overview.GeneralSummary.MonthFinancialNet,
            overview.Accounts.Take(50).Select(x => new DashboardAccount(x.Name, x.CurrentBalance, x.MonthIncome, x.MonthExpense)).ToList());
    }

    private async Task<IEnumerable<CatalogItem>> ListSubcategoriesAsync(string? category, int userId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(category))
            return (await _subcategories.GetByUserIdAsync(userId, true)).Take(CatalogLimit).Select(x => new CatalogItem(x.SubcategoryId, x.Name));

        var categoryId = await ResolveCategoryIdAsync(category, null, userId, cancellationToken);
        return categoryId.Id is null
            ? []
            : (await _subcategories.GetByCategoryIdAsync(userId, categoryId.Id.Value, true)).Take(CatalogLimit).Select(x => new CatalogItem(x.SubcategoryId, x.Name));
    }

    private async Task<Resolution> ResolveCategoryIdAsync(string? name, string? type, int userId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name)) return new Resolution(null, null);
        var categories = type is "expense" or "income"
            ? await _categories.GetByTypeAsync(userId, type)
            : await _categories.GetAllActiveByUserIdAsync(userId);
        cancellationToken.ThrowIfCancellationRequested();
        var item = categories.FirstOrDefault(x => x.Active && SameName(x.Name, name));
        return item is null ? new Resolution(null, "categoría no encontrada.") : new Resolution(item.CategoryId, null);
    }

    private async Task<Resolution> ResolveSubcategoryIdAsync(string? name, int userId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name)) return new Resolution(null, null);
        var item = (await _subcategories.GetByUserIdAsync(userId, true)).FirstOrDefault(x => SameName(x.Name, name));
        cancellationToken.ThrowIfCancellationRequested();
        return item is null ? new Resolution(null, "subcategoría no encontrada.") : new Resolution(item.SubcategoryId, null);
    }

    private async Task<Resolution> ResolveAccountIdAsync(string? name, int userId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name)) return new Resolution(null, null);
        var item = (await _accounts.GetAllActiveByUserIdAsync(userId)).FirstOrDefault(x => SameName(x.Name, name));
        cancellationToken.ThrowIfCancellationRequested();
        return item is null ? new Resolution(null, "cuenta no encontrada.") : new Resolution(item.AccountId, null);
    }

    private async Task<Resolution> ResolveMerchantIdAsync(string? name, int userId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name)) return new Resolution(null, null);
        var item = (await _merchants.GetByUserIdAsync(userId, true)).FirstOrDefault(x => SameName(x.Name, name));
        cancellationToken.ThrowIfCancellationRequested();
        return item is null ? new Resolution(null, "comercio no encontrado.") : new Resolution(item.MerchantId, null);
    }

    private static bool TryParseDate(string? value, out DateOnly date) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    private static string? Normalize(string? value, string[] allowed)
    {
        if (string.IsNullOrWhiteSpace(value)) return allowed.Contains("total") ? "total" : null;
        var normalized = value.Trim().ToLowerInvariant();
        return allowed.Contains(normalized) ? normalized : null;
    }

    private static bool SameName(string actual, string expected) => string.Equals(actual.Trim(), expected.Trim(), StringComparison.OrdinalIgnoreCase);

    public sealed class ResumenGastosRequest
    {
        public string Desde { get; set; } = "";
        public string Hasta { get; set; } = "";
        public string? Tipo { get; set; }
        public string? Categoria { get; set; }
        public string? Subcategoria { get; set; }
        public string? Cuenta { get; set; }
        public string? Comercio { get; set; }
        public string AgruparPor { get; set; } = "total";
        public int Limite { get; set; } = 20;
    }

    public sealed class ListarCatalogosRequest
    {
        public string Tipo { get; set; } = "";
        public string? Categoria { get; set; }
    }

    public sealed class ResumenDashboardRequest
    {
        public string? Mes { get; set; }
    }

    private sealed record Resolution(int? Id, string? Error);
    private sealed record ToolError(string Error);
    private sealed record CatalogItem(int Id, string Nombre);
    private sealed record CatalogResponse(List<CatalogItem> Items);
    private sealed record AggregateBucket(string? Nombre, decimal Gastos, decimal Ingresos, int Cantidad);
    private sealed record ResumenGastosResponse(decimal GastosTotales, decimal IngresosTotales, string AgruparPor, List<AggregateBucket> Grupos);
    private sealed record DashboardAccount(string Nombre, decimal SaldoActual, decimal IngresosMes, decimal GastosMes);
    private sealed record DashboardResponse(string Mes, decimal Ingresos, decimal Gastos, decimal Neto, List<DashboardAccount> Cuentas);
}
