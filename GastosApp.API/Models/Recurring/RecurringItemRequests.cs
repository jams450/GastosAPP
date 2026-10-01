namespace GastosApp.API.Models.Recurring;

/// <summary>
/// Alta de una plantilla de programado. El scope es XOR: exactamente uno de
/// <see cref="CategoryId"/> o <see cref="SubcategoryId"/>; un ingreso no admite subcategoría.
/// </summary>
public class RecurringItemCreateRequest
{
    /// <summary><c>income</c> o <c>expense</c>. Inmutable tras el alta.</summary>
    public string Kind { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    /// <summary><c>fixed</c> (default) o <c>average</c>. En <c>average</c> no se envía monto.</summary>
    public string? AmountMode { get; set; }

    public decimal? AmountMxn { get; set; }

    /// <summary>Día del mes de la ocurrencia (1–31). Si el mes no lo tiene, aplica el último día.</summary>
    public int DayOfMonth { get; set; }

    public int? CategoryId { get; set; }

    public int? SubcategoryId { get; set; }

    public int? AccountId { get; set; }

    public int? MerchantId { get; set; }

    /// <summary>Primer periodo <c>yyyy-MM</c>. No puede ser anterior al mes en curso.</summary>
    public string? StartsPeriod { get; set; }

    public string? EndsPeriod { get; set; }

    /// <summary>Solo válido para gasto con cuenta y con la salida de Telegram configurada.</summary>
    public bool AutoExecute { get; set; }

    /// <summary>
    /// Fecha de entrada en vigor decidida a mano. Nunca anterior al primer día del mes en curso.
    /// Gobierna únicamente el primer periodo.
    /// </summary>
    public DateTime? EffectiveFrom { get; set; }
}

/// <summary>Edición de plantilla. <c>kind</c> es inmutable: cambiarlo rompería el scope y la unicidad.</summary>
public class RecurringItemUpdateRequest
{
    public string Kind { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? AmountMode { get; set; }

    public decimal? AmountMxn { get; set; }

    public int DayOfMonth { get; set; }

    public int? CategoryId { get; set; }

    public int? SubcategoryId { get; set; }

    public int? AccountId { get; set; }

    public int? MerchantId { get; set; }

    public string? StartsPeriod { get; set; }

    public string? EndsPeriod { get; set; }

    public bool AutoExecute { get; set; }

    public DateTime? EffectiveFrom { get; set; }
}

/// <summary>
/// Cuerpo del guardado desde el histórico. <see cref="DryRun"/> nace en <c>true</c>: sin confirmación
/// explícita solo se devuelve la propuesta.
/// </summary>
public class RecurringItemFromTransactionRequest
{
    public int TransactionId { get; set; }

    public bool DryRun { get; set; } = true;
}

/// <summary>Fila del catálogo. No expone montos derivados ni credenciales.</summary>
public class RecurringItemResponse
{
    public int RecurringItemId { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string AmountMode { get; set; } = string.Empty;
    public decimal? AmountMxn { get; set; }
    public int DayOfMonth { get; set; }
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public int? AccountId { get; set; }
    public int? MerchantId { get; set; }
    public string StartsPeriod { get; set; } = string.Empty;
    public string? EndsPeriod { get; set; }
    public bool Active { get; set; }
    public bool AutoExecute { get; set; }
    public DateTime? EffectiveFrom { get; set; }
    public DateTime? Created { get; set; }
    public DateTime? Updated { get; set; }
}

/// <summary>Resultado del guardado desde el histórico: propuesta, plantilla escrita o colisión.</summary>
public class RecurringItemFromTransactionResponse
{
    public bool DryRun { get; set; }
    public bool Written { get; set; }

    /// <summary><c>true</c> cuando ya existía una plantilla activa con el mismo <c>(kind, name)</c>.</summary>
    public bool Conflict { get; set; }

    public RecurringItemResponse? Template { get; set; }

    /// <summary>Plantilla existente cuando <see cref="Conflict"/> es <c>true</c>.</summary>
    public RecurringItemResponse? Existing { get; set; }
}

/// <summary>
/// Soporte del checkbox <c>autoExecute</c>: permite deshabilitarlo con explicación en vez de dejar
/// que el usuario choque con un 400. Nunca devuelve <c>chat_id</c>, token ni credenciales.
/// </summary>
public class RecurringItemConfigResponse
{
    public bool AutoExecuteAvailable { get; set; }
    public string? Reason { get; set; }
}
