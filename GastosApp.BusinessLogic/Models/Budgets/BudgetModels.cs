namespace GastosApp.BusinessLogic.Models.Budgets
{
    /// <summary>Entrada de creación/edición de presupuesto. Scope XOR: categoría o subcategoría.</summary>
    public class BudgetWriteInput
    {
        public string? PeriodKey { get; set; }
        public string Name { get; set; } = string.Empty;
        public int? CategoryId { get; set; }
        public int? SubcategoryId { get; set; }
        public decimal AmountMxn { get; set; }
        /// <summary>Solo en creación. Vacío/null => 80 y 100.</summary>
        public List<BudgetThresholdInput>? Thresholds { get; set; }
    }

    /// <summary>Umbral de consumo. <see cref="Percent"/> puede superar 100 (sobregiro).</summary>
    public class BudgetThresholdInput
    {
        public string Name { get; set; } = string.Empty;
        public decimal Percent { get; set; }
        public bool Active { get; set; } = true;
    }

    /// <summary>
    /// Estado calculado de un presupuesto en su periodo.
    /// El desglose (<see cref="Spent"/>/<see cref="Committed"/>/<see cref="Projected"/>) es aditivo:
    /// ningún campo de Fase 2 se renombra ni se elimina. <see cref="Effective"/> = <see cref="Spent"/>
    /// + <see cref="Committed"/>; <see cref="Forecast"/> = <see cref="Effective"/> + <see cref="Projected"/>.
    /// </summary>
    public class BudgetStatusResult
    {
        public int BudgetId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string PeriodKey { get; set; } = string.Empty;
        public int? CategoryId { get; set; }
        public int? SubcategoryId { get; set; }
        public bool Active { get; set; }
        public decimal AmountMxn { get; set; }

        /// <summary>Gasto real ejecutado del periodo. No caduca nunca.</summary>
        public decimal Spent { get; set; }

        /// <summary>Gasto ejecutado como porcentaje del límite.</summary>
        public decimal SpentPercent { get; set; }

        /// <summary>Planificado no ejecutado con periodo abierto (partidas <c>pending</c>/<c>ignored</c> no proyectadas).</summary>
        public decimal Committed { get; set; }

        public decimal CommittedPercent { get; set; }

        /// <summary>Cuotas derivadas de promedio no confirmadas. No compromete dinero.</summary>
        public decimal Projected { get; set; }

        public decimal ProjectedPercent { get; set; }

        /// <summary><see cref="Spent"/> + <see cref="Committed"/>: contra esto se calcula el restante.</summary>
        public decimal Effective { get; set; }

        /// <summary><see cref="Effective"/> + <see cref="Projected"/>. Informativo.</summary>
        public decimal Forecast { get; set; }

        /// <summary>
        /// Porcentaje <b>mostrado</b> = <see cref="SpentPercent"/> + <see cref="CommittedPercent"/>.
        /// Es el desglose agregado; el umbral se decide con <see cref="ThresholdPercent"/>.
        /// </summary>
        public decimal PercentUsed { get; set; }

        /// <summary>
        /// Porcentaje que decide <see cref="Status"/> y <see cref="ReachedThreshold"/>: con el
        /// interruptor <c>Alerts:CommittedCountsEnabled</c> activo equivale a <see cref="PercentUsed"/>,
        /// y con el interruptor apagado equivale a <see cref="SpentPercent"/>.
        /// </summary>
        public decimal ThresholdPercent { get; set; }

        /// <summary><see cref="AmountMxn"/> − <see cref="Effective"/>.</summary>
        public decimal Remaining { get; set; }

        /// <summary>Suma de <c>planned_amount</c> de las partidas no canceladas del scope.</summary>
        public decimal PlannedAmount { get; set; }

        /// <summary><see cref="PlannedAmount"/> − <see cref="Spent"/>: desviación del plan.</summary>
        public decimal Variance { get; set; }

        /// <summary>Partidas <c>pending</c> del scope, se reporten o no en <see cref="Committed"/>.</summary>
        public int ItemsPending { get; set; }

        public int ItemsExecuted { get; set; }

        /// <summary>Partidas <c>pending</c> de un periodo ya cerrado: caducaron sin ejecutarse.</summary>
        public int ItemsUnexecuted { get; set; }

        public int ItemsIgnored { get; set; }

        /// <summary>Ingresos planificados del scope: suma de partidas <c>income</c> no canceladas.</summary>
        public decimal PlannedIncome { get; set; }

        /// <summary>Ingresos planificados con periodo abierto (no proyectados).</summary>
        public decimal CommittedIncome { get; set; }

        /// <summary>Ingresos derivados de promedio, aún no confirmados.</summary>
        public decimal ProjectedIncome { get; set; }

        /// <summary><c>ok</c>, <c>warning</c> o <c>exceeded</c>.</summary>
        public string Status { get; set; } = string.Empty;

        /// <summary>Umbral activo más alto ya cruzado por <see cref="ThresholdPercent"/>, si existe.</summary>
        public BudgetThresholdStatusItem? ReachedThreshold { get; set; }
    }

    public class BudgetThresholdStatusItem
    {
        public int ThresholdId { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal Percent { get; set; }
    }

    /// <summary>
    /// Entrada de creación/edición de partida planificada. El scope es XOR: exactamente uno de
    /// <see cref="CategoryId"/> o <see cref="SubcategoryId"/>. <c>period_key</c> no se recibe:
    /// se deriva de <see cref="PlannedDate"/>.
    /// </summary>
    public class BudgetItemWriteInput
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

    /// <summary>Entrada de transición de estado de una partida. <c>executed</c> exige enlace previo.</summary>
    public class BudgetItemStatusInput
    {
        public string Status { get; set; } = string.Empty;
    }

    /// <summary>
    /// Fila de partida para lectura. No incluye el monto de la transacción enlazada: la desviación
    /// se calcula en <c>/api/plan/summary</c>, no aquí.
    /// </summary>
    public class BudgetItemListItem
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
        public int? RecurringItemId { get; set; }
        /// <summary><c>pending</c>, <c>executed</c>, <c>ignored</c> o <c>cancelled</c>.</summary>
        public string Status { get; set; } = string.Empty;
        public bool IsProjected { get; set; }
        public int? TransactionId { get; set; }
        /// <summary><c>manual</c> o <c>template</c>.</summary>
        public string Source { get; set; } = string.Empty;
        public string? Notes { get; set; }
        public DateTime? Created { get; set; }
        public DateTime? Updated { get; set; }
    }

    /// <summary>Filtros de listado de partidas. Todos opcionales salvo el periodo por default.</summary>
    public class BudgetItemQuery
    {
        public string? PeriodKey { get; set; }
        public string? Kind { get; set; }
        public string? Status { get; set; }
    }

    /// <summary>Desviación de una partida ejecutada: <see cref="PlannedAmount"/> − <see cref="ExecutedAmount"/>.</summary>
    public class PlanItemVariance
    {
        public int ItemId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
        public decimal PlannedAmount { get; set; }
        public decimal ExecutedAmount { get; set; }
        /// <summary>Positivo = se gastó menos de lo planeado; negativo = sobregiro de la partida.</summary>
        public decimal Variance { get; set; }
    }

    /// <summary>
    /// Vista consolidada del plan del periodo. Es una primera versión: el shape puede refinarse en
    /// la Fase 3.5 (UI/BFF) sin tocar la agregación.
    /// </summary>
    public class PlanSummaryResult
    {
        public string PeriodKey { get; set; } = string.Empty;

        /// <summary>Desglose por presupuesto del periodo, reutilizando el estado de <c>BudgetService</c>.</summary>
        public IReadOnlyList<BudgetStatusResult> Budgets { get; set; } = Array.Empty<BudgetStatusResult>();

        public decimal PlannedIncome { get; set; }
        public decimal CommittedIncome { get; set; }
        public decimal ProjectedIncome { get; set; }
        public decimal ExecutedIncome { get; set; }

        /// <summary>Desviaciones de las partidas de gasto ya ejecutadas.</summary>
        public IReadOnlyList<PlanItemVariance> Variances { get; set; } = Array.Empty<PlanItemVariance>();

        /// <summary>Partidas del periodo que no caen en ningún presupuesto por scope.</summary>
        public IReadOnlyList<BudgetItemListItem> ItemsWithoutBudget { get; set; } = Array.Empty<BudgetItemListItem>();

        /// <summary>Partidas del periodo agrupadas por cuenta; solo las que tienen <c>account_id</c>.</summary>
        public IReadOnlyList<PlanAccountFlow> AccountFlows { get; set; } = Array.Empty<PlanAccountFlow>();
    }

    /// <summary>Flujo planificado de una cuenta: partidas del periodo que la referencian.</summary>
    public class PlanAccountFlow
    {
        public int AccountId { get; set; }
        public decimal PlannedExpense { get; set; }
        public decimal PlannedIncome { get; set; }
        public int ItemCount { get; set; }
    }
}
