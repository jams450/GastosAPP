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

    /// <summary>Estado calculado de un presupuesto en su periodo.</summary>
    public class BudgetStatusResult
    {
        public int BudgetId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string PeriodKey { get; set; } = string.Empty;
        public int? CategoryId { get; set; }
        public int? SubcategoryId { get; set; }
        public bool Active { get; set; }
        public decimal AmountMxn { get; set; }
        public decimal Spent { get; set; }
        public decimal Remaining { get; set; }
        public decimal PercentUsed { get; set; }
        /// <summary><c>ok</c>, <c>warning</c> o <c>exceeded</c>.</summary>
        public string Status { get; set; } = string.Empty;
        /// <summary>Umbral activo más alto ya cruzado, si existe.</summary>
        public BudgetThresholdStatusItem? ReachedThreshold { get; set; }
    }

    public class BudgetThresholdStatusItem
    {
        public int ThresholdId { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal Percent { get; set; }
    }
}
