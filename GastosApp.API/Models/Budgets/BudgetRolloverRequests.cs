namespace GastosApp.API.Models.Budgets;

/// <summary>
/// Cuerpo del rollover de plan. <see cref="DryRun"/> nace en <c>true</c>: por defecto solo se
/// devuelven los conteos, sin escribir nada.
/// </summary>
public class BudgetRolloverRequest
{
    /// <summary>Periodo origen <c>yyyy-MM</c>. Requerido.</summary>
    public string? FromPeriod { get; set; }

    /// <summary>Periodo destino <c>yyyy-MM</c>. Requerido y posterior al origen.</summary>
    public string? ToPeriod { get; set; }

    /// <summary><c>copy</c>, <c>remount</c> o <c>copy-and-remount</c> (default).</summary>
    public string? Mode { get; set; }

    public bool DryRun { get; set; } = true;
}

/// <summary>
/// Conteos de un bloque del rollover. <c>attempted</c> siempre es
/// <c>inserted + skipped + omitted</c>: un descarte nunca queda invisible.
/// </summary>
public class BudgetRolloverCountsResponse
{
    public int Attempted { get; set; }
    public int Inserted { get; set; }

    /// <summary>Candidatas que no se insertaron porque la clave única ya existía.</summary>
    public int Skipped { get; set; }

    /// <summary>Candidatas descartadas sin intentar insertar (monto promedio sin historial).</summary>
    public int Omitted { get; set; }
}

/// <summary>Resultado del rollover: lo escrito, o lo que se escribiría con <c>dryRun</c>.</summary>
public class BudgetRolloverResponse
{
    public string FromPeriod { get; set; } = string.Empty;
    public string ToPeriod { get; set; } = string.Empty;
    public string Mode { get; set; } = string.Empty;
    public bool DryRun { get; set; }

    public BudgetRolloverCountsResponse Budgets { get; set; } = new();
    public BudgetRolloverCountsResponse ManualItems { get; set; } = new();
    public BudgetRolloverCountsResponse RemountedItems { get; set; } = new();
}
