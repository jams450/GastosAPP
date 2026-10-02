namespace GastosApp.API.Models.BudgetItems;

/// <summary>
/// Alta de partida planificada. <c>periodKey</c> no se recibe: el periodo se deriva de
/// <see cref="PlannedDate"/>. Scope XOR: exactamente uno de <see cref="CategoryId"/> o
/// <see cref="SubcategoryId"/>; un ingreso no admite subcategoría.
/// </summary>
public class BudgetItemCreateRequest
{
    /// <summary><c>income</c> o <c>expense</c>. Inmutable tras el alta.</summary>
    public string Kind { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public decimal PlannedAmount { get; set; }

    public DateTime PlannedDate { get; set; }

    public int? CategoryId { get; set; }

    public int? SubcategoryId { get; set; }

    public int? AccountId { get; set; }

    public int? MerchantId { get; set; }

    public string? Notes { get; set; }

    /// <summary>
    /// Alta selectiva desde plantilla: con valor, la partida se deriva de la programada indicada
    /// (<c>plannedDate</c> solo aporta el mes destino) y queda ligada con
    /// <c>source=template</c>. Nulo = alta manual, comportamiento intacto.
    /// </summary>
    public int? RecurringItemId { get; set; }
}

/// <summary>
/// Edición de partida. <c>kind</c> es inmutable: cambiarlo rompería el XOR de scope y la unicidad
/// por nombre. Si <see cref="PlannedDate"/> cambia de mes, el periodo se recalcula.
/// </summary>
public class BudgetItemUpdateRequest
{
    public string Kind { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public decimal PlannedAmount { get; set; }

    public DateTime PlannedDate { get; set; }

    public int? CategoryId { get; set; }

    public int? SubcategoryId { get; set; }

    public int? AccountId { get; set; }

    public int? MerchantId { get; set; }

    public string? Notes { get; set; }
}

/// <summary>Transición manual de estado. <c>cancelled</c> no se alcanza por aquí.</summary>
public class BudgetItemStatusRequest
{
    /// <summary><c>pending</c>, <c>executed</c> o <c>ignored</c>.</summary>
    public string Status { get; set; } = string.Empty;
}

/// <summary>Fila de partida. No expone el monto de la transacción enlazada.</summary>
public class BudgetItemResponse
{
    public int ItemId { get; set; }
    public string PeriodKey { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal PlannedAmount { get; set; }
    public DateTime PlannedDate { get; set; }
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public int? AccountId { get; set; }
    public int? MerchantId { get; set; }
    public int? RecurringItemId { get; set; }
    public string Status { get; set; } = string.Empty;
    public bool IsProjected { get; set; }
    public int? TransactionId { get; set; }
    public string Source { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime? Created { get; set; }
    public DateTime? Updated { get; set; }
}

/// <summary>Resultado de la purga de partidas canceladas de un periodo.</summary>
public class BudgetItemPurgeResponse
{
    public string PeriodKey { get; set; } = string.Empty;
    public int Deleted { get; set; }
}

/// <summary>
/// Candidata a match <b>débil</b> de un periodo: misma categoría/subcategoría y mismo mes. Es una
/// <b>sugerencia</b>, no un enlace: la partida sigue <c>pending</c> y el endpoint no escribe nada.
/// </summary>
public class BudgetItemSuggestionResponse
{
    public int ItemId { get; set; }
    public string PeriodKey { get; set; } = string.Empty;
    /// <summary><c>income</c> o <c>expense</c>.</summary>
    public string Kind { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal PlannedAmount { get; set; }
    public DateTime PlannedDate { get; set; }
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public int? AccountId { get; set; }
    public int? MerchantId { get; set; }
    public int TransactionId { get; set; }
    public decimal TransactionAmount { get; set; }
    /// <summary>Fecha local del gasto candidato, no el instante UTC.</summary>
    public DateTime TransactionDate { get; set; }
    /// <summary>Días entre la fecha planificada y la fecha local del gasto.</summary>
    public int DistanceDays { get; set; }
    /// <summary>Siempre <c>weak</c>: esta lista solo expone candidatas débiles.</summary>
    public string Strength { get; set; } = string.Empty;
}
