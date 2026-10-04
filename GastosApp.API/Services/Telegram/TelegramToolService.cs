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
    private readonly IBudgetService _budgets;
    private readonly IAlertEvaluationService _alerts;

    public TelegramToolService(
        ITransactionQueryService transactions,
        IAccountService accounts,
        ICategoryService categories,
        ISubcategoryService subcategories,
        IMerchantService merchants,
        ITagService tags,
        IDashboardService dashboard,
        IBudgetService budgets,
        IAlertEvaluationService alerts)
    {
        _transactions = transactions;
        _accounts = accounts;
        _categories = categories;
        _subcategories = subcategories;
        _merchants = merchants;
        _tags = tags;
        _dashboard = dashboard;
        _budgets = budgets;
        _alerts = alerts;
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

    private const int FinancialAccountLimit = 50;

    public async Task<object> SaldosEfectivoAsync(TelegramFinancialRequest request, int userId, CancellationToken cancellationToken)
    {
        var month = ValidateFinancialRequest(request);
        if (month.Error is not null) return new ToolError(month.Error);
        cancellationToken.ThrowIfCancellationRequested();
        var overview = await _dashboard.GetOverviewAsync(userId, month.Month, "America/Mexico_City");
        cancellationToken.ThrowIfCancellationRequested();
        var accounts = overview.Accounts.Where(x => !x.IsCredit).OrderBy(x => x.AccountId).ToList();
        return new TelegramCashBalances(overview.Month, "Saldo actual; no es saldo histórico del mes solicitado.",
            accounts.Sum(x => x.CurrentBalance), accounts.Count, accounts.Count > FinancialAccountLimit,
            accounts.Take(FinancialAccountLimit).Select(x => new TelegramCashAccount(x.AccountId, x.Name, x.CurrentBalance)).ToList());
    }

    public async Task<object> CreditoDisponibleAsync(TelegramFinancialRequest request, int userId, CancellationToken cancellationToken)
    {
        var month = ValidateFinancialRequest(request);
        if (month.Error is not null) return new ToolError(month.Error);
        cancellationToken.ThrowIfCancellationRequested();
        var overview = await _dashboard.GetOverviewAsync(userId, month.Month, "America/Mexico_City");
        cancellationToken.ThrowIfCancellationRequested();
        var accounts = overview.Accounts.Where(x => x.IsCredit).OrderBy(x => x.AccountId).ToList();
        var unknown = accounts.Count(x => x.CreditAvailable is null);
        return new TelegramAvailableCredit(overview.Month,
            "Snapshot actual, no histórico. Suma solo límites conocidos; puede ser negativa. Null significa límite desconocido.",
            accounts.Sum(x => x.CreditAvailable ?? 0), unknown == 0, unknown, accounts.Count,
            accounts.Count > FinancialAccountLimit,
            accounts.Take(FinancialAccountLimit).Select(x => new TelegramCreditAccount(x.AccountId, x.Name, x.CreditAvailable)).ToList());
    }

    public async Task<object> ResumenFinancieroAsync(TelegramFinancialRequest request, int userId, CancellationToken cancellationToken)
    {
        var month = ValidateFinancialRequest(request);
        if (month.Error is not null) return new ToolError(month.Error);
        var scope = request.Scope ?? "all";
        cancellationToken.ThrowIfCancellationRequested();
        var overview = await _dashboard.GetOverviewAsync(userId, month.Month, "America/Mexico_City");
        cancellationToken.ThrowIfCancellationRequested();
        return scope switch
        {
            "cash" => new TelegramFinancialSummary(overview.Month, scope, overview.CashSummary.MonthIncome,
                overview.CashSummary.MonthExpense, overview.CashSummary.MonthFinancialNet),
            "credit" => new TelegramFinancialSummary(overview.Month, scope, overview.CreditSummary.MonthIncome,
                overview.CreditSummary.MonthExpense, overview.CreditSummary.MonthFinancialNet),
            _ => new TelegramFinancialSummary(overview.Month, scope, overview.GeneralSummary.MonthIncome,
                overview.GeneralSummary.MonthExpense, overview.GeneralSummary.MonthFinancialNet)
        };
    }

    public async Task<object> PagoTarjetasAsync(TelegramFinancialRequest request, int userId, CancellationToken cancellationToken)
    {
        var month = ValidateFinancialRequest(request);
        if (month.Error is not null) return new ToolError(month.Error);
        cancellationToken.ThrowIfCancellationRequested();
        var overview = await _dashboard.GetOverviewAsync(userId, month.Month, "America/Mexico_City");
        cancellationToken.ThrowIfCancellationRequested();
        var accounts = overview.Accounts.Where(x => x.IsCredit).OrderBy(x => x.AccountId).ToList();
        return new TelegramCutoffPayments(overview.Month, "America/Mexico_City",
            "Pago estimado, pagos realizados y pendiente del corte; ciclo propio por cuenta, no necesariamente mes calendario. No es pago mínimo ni pago para no generar intereses.",
            accounts.Sum(x => x.EstimatedCutoffCharges), accounts.Sum(x => x.CutoffPayments),
            accounts.Sum(x => x.CutoffPending), accounts.Count, accounts.Count > FinancialAccountLimit,
            accounts.Take(FinancialAccountLimit).Select(x => new TelegramCutoffAccount(
                x.AccountId, x.Name, x.EstimatedCutoffCharges, x.CutoffPayments, x.CutoffPending,
                x.PeriodStart, x.PeriodEnd)).ToList());
    }

    public async Task<object> PresupuestosAsync(TelegramFinancialRequest request, int userId, CancellationToken cancellationToken)
    {
        var month = ValidateFinancialRequest(request);
        if (month.Error is not null) return new ToolError(month.Error);
        cancellationToken.ThrowIfCancellationRequested();
        // El servicio no acepta token: comprobamos cancelación antes y después, sin prometer interrumpir la consulta.
        var statuses = await _budgets.GetPeriodStatusAsync(userId, month.Month);
        cancellationToken.ThrowIfCancellationRequested();
        return new TelegramBudgetResponse(month.Month!, "America/Mexico_City", statuses.Count,
            statuses.Count(x => x.Active), statuses.Count > FinancialAccountLimit,
            statuses.OrderBy(x => x.BudgetId).Take(FinancialAccountLimit).Select(x => new TelegramBudgetStatus(
                x.BudgetId, x.Name, x.PeriodKey, x.CategoryId, x.SubcategoryId, x.Active, x.AmountMxn,
                x.Spent, x.SpentPercent, x.Committed, x.CommittedPercent, x.Projected, x.ProjectedPercent,
                x.Effective, x.Forecast, x.PercentUsed, x.ThresholdPercent, x.Remaining, x.PlannedAmount,
                x.Variance, x.ItemsPending, x.ItemsExecuted, x.ItemsIgnored, x.PlannedIncome,
                x.CommittedIncome, x.ProjectedIncome, x.Status,
                x.ReachedThreshold is null ? null : new TelegramBudgetThreshold(
                    x.ReachedThreshold.ThresholdId, x.ReachedThreshold.Name, x.ReachedThreshold.Percent))).ToList());
    }

    public async Task<object> AlertasPresupuestoAsync(TelegramAlertRequest request, int userId, CancellationToken cancellationToken)
    {
        var month = ValidateFinancialRequest(new TelegramFinancialRequest(request.Mes));
        if (month.Error is not null) return new ToolError(month.Error);
        cancellationToken.ThrowIfCancellationRequested();
        var deliveries = await _alerts.ListDeliveriesAsync(userId, month.Month, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        var sent = deliveries.Count(x => x.OutboxStatus == "sent");
        var pending = deliveries.Count(x => x.OutboxStatus == "pending");
        var failed = deliveries.Count(x => x.OutboxStatus == "failed");
        return new TelegramAlertResponse(month.Month!, "America/Mexico_City",
            "Solo historial de umbrales de presupuesto, no todos los avisos de partidas. Sin filas no prueba ausencia global de alertas. Enviado no significa leído.",
            deliveries.Count, sent, pending, failed, deliveries.Count - sent - pending - failed,
            deliveries.Count > FinancialAccountLimit,
            deliveries.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.DeliveryId)
                .Take(FinancialAccountLimit).Select(x => new TelegramAlertDelivery(
                    x.DeliveryId, x.BudgetId, x.BudgetName, x.ThresholdId, x.ThresholdName, x.PeriodKey,
                    x.ThresholdPercent, x.BudgetAmount, x.SpentAmount, x.PercentUsed, x.CreatedAt,
                    x.OutboxStatus, x.SentAt, x.OutboxStatus == "sent")).ToList());
    }

    private static (string? Month, string? Error) ValidateFinancialRequest(TelegramFinancialRequest request)
    {
        if (request.Scope is not null && request.Scope is not ("all" or "cash" or "credit"))
            return (null, "scope debe ser all, cash o credit.");
        if (request.Mes is not null && (request.Mes.Length != 7 ||
            !DateOnly.TryParseExact(request.Mes + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)))
            return (null, "mes debe tener formato yyyy-MM.");
        return (request.Mes ?? GastosApp.BusinessLogic.Services.MonthRangeResolver.CurrentPeriodKey("America/Mexico_City"), null);
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
    public sealed record ToolError(string Error);
    private sealed record CatalogItem(int Id, string Nombre);
    private sealed record CatalogResponse(List<CatalogItem> Items);
    private sealed record AggregateBucket(string? Nombre, decimal Gastos, decimal Ingresos, int Cantidad);
    private sealed record ResumenGastosResponse(decimal GastosTotales, decimal IngresosTotales, string AgruparPor, List<AggregateBucket> Grupos);
    private sealed record DashboardAccount(string Nombre, decimal SaldoActual, decimal IngresosMes, decimal GastosMes);
    private sealed record DashboardResponse(string Mes, decimal Ingresos, decimal Gastos, decimal Neto, List<DashboardAccount> Cuentas);
}
