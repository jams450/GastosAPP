namespace GastosApp.BusinessLogic.Models.Budgets
{
    /// <summary>Modos de rollover de un mes a otro (sección 2.4). Gobiernan <b>solo</b> las partidas.</summary>
    public static class BudgetRolloverMode
    {
        /// <summary>Copia literal de las partidas manuales; no regenera las de plantilla.</summary>
        public const string Copy = "copy";

        /// <summary>Regenera las partidas de plantilla; omite las manuales.</summary>
        public const string Remount = "remount";

        /// <summary>Copia las manuales y regenera las de plantilla. Modo por defecto.</summary>
        public const string CopyAndRemount = "copy-and-remount";

        public static bool IsValid(string? value) =>
            value == Copy || value == Remount || value == CopyAndRemount;
    }

    /// <summary>Entrada del rollover. <c>mode</c> vacío usa <see cref="BudgetRolloverMode.CopyAndRemount"/>.</summary>
    public class BudgetRolloverInput
    {
        /// <summary>Periodo origen <c>yyyy-MM</c>. Requerido.</summary>
        public string? FromPeriod { get; set; }

        /// <summary>Periodo destino <c>yyyy-MM</c>. Requerido y posterior al origen.</summary>
        public string? ToPeriod { get; set; }

        public string? Mode { get; set; }

        /// <summary>Default <c>true</c>: sin confirmación explícita no se escribe nada.</summary>
        public bool DryRun { get; set; } = true;
    }

    /// <summary>
    /// Conteos por bloque del rollover. <c>Attempted</c> siempre es igual a
    /// <c>Inserted + Skipped + Omitted</c>, para que un descarte por clave ocupada sea visible en vez
    /// de confundirse con un monto derivado que faltó.
    /// </summary>
    public class BudgetRolloverCounts
    {
        public int Attempted { get; set; }
        public int Inserted { get; set; }

        /// <summary>Candidatas que no se insertaron porque la clave única ya existía.</summary>
        public int Skipped { get; set; }

        /// <summary>Candidatas descartadas sin intentar insertar (monto promedio sin historial).</summary>
        public int Omitted { get; set; }
    }

    /// <summary>Resultado del rollover: espeja lo que se escribió, o lo que se escribiría con <c>dryRun</c>.</summary>
    public class BudgetRolloverResult
    {
        public string FromPeriod { get; set; } = string.Empty;
        public string ToPeriod { get; set; } = string.Empty;

        /// <summary>Modo efectivamente aplicado, ya normalizado.</summary>
        public string Mode { get; set; } = string.Empty;

        public bool DryRun { get; set; }

        /// <summary>Presupuestos clonados del mes origen con sus umbrales.</summary>
        public BudgetRolloverCounts Budgets { get; set; } = new();

        /// <summary>Partidas <c>manual</c> copiadas con la fecha recalculada al mes destino.</summary>
        public BudgetRolloverCounts ManualItems { get; set; } = new();

        /// <summary>Partidas <c>template</c> regeneradas desde su plantilla de programado.</summary>
        public BudgetRolloverCounts RemountedItems { get; set; } = new();
    }

    /// <summary>
    /// Alta idempotente de una partida planificada. Lleva todo lo que necesita el
    /// <c>INSERT … ON CONFLICT DO NOTHING</c> del materializador: una sola sentencia atómica decide
    /// si la ocurrencia ya existía, sin leer antes.
    /// </summary>
    public class BudgetItemClaim
    {
        public int UserId { get; set; }
        public string PeriodKey { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public decimal PlannedAmount { get; set; }

        /// <summary>
        /// Fecha de la partida. <see cref="DateOnly"/> y no <see cref="DateTime"/>: viaja como parámetro
        /// crudo al <c>INSERT</c> de <c>budget_items</c>, cuya columna <c>planned_date</c> es <c>date</c>.
        /// <see cref="DateOnly"/> es el tipo que Npgsql mapea nativamente a <c>date</c>; un
        /// <see cref="DateTime"/> <c>Kind=Unspecified</c> se infiere como <c>timestamp with time zone</c>
        /// y Npgsql lo rechaza, y "arreglarlo" con UTC corrió el día al castear a <c>date</c>.
        /// </summary>
        public DateOnly PlannedDate { get; set; }
        public int? CategoryId { get; set; }
        public int? SubcategoryId { get; set; }
        public int? AccountId { get; set; }
        public int? MerchantId { get; set; }
        public int? RecurringItemId { get; set; }

        /// <summary>Monto derivado de un promedio, no confirmado por el usuario.</summary>
        public bool IsProjected { get; set; }

        /// <summary><c>manual</c> o <c>template</c>.</summary>
        public string Source { get; set; } = string.Empty;
    }
}
