namespace GastosApp.BusinessLogic.Models.Budgets
{
    /// <summary>
    /// Fuerza de un vínculo partida ↔ transacción (sección 4.4 del plan). El orden del enum es el
    /// orden de fuerza: <see cref="None"/> no es candidata, <see cref="Weak"/> solo se sugiere y
    /// <see cref="Strong"/> es la única que el servicio puede enlazar sin intervención del usuario.
    /// </summary>
    public enum BudgetItemMatchStrength
    {
        /// <summary>No cumple ninguna regla: ni fuerza ni sugerencia.</summary>
        None = 0,

        /// <summary>Misma categoría/subcategoría y mismo mes. <b>Nunca</b> escribe: es sugerencia.</summary>
        Weak = 1,

        /// <summary>Comercio, o cuenta + alcance, con monto dentro de la tolerancia.</summary>
        Strong = 2
    }

    /// <summary>
    /// Par evaluable de forma pura: la partida de un lado y la transacción del otro, con la fecha
    /// de la transacción ya resuelta a <b>fecha local</b> (regla del día, no del instante). No lleva
    /// navegación ni nada que dependa de EF: existe para que <c>BudgetItemMatcher</c> sea
    /// inspeccionable sin base de datos.
    /// </summary>
    public readonly record struct BudgetItemMatchInput
    {
        /// <summary>
        /// Constructor explícito: un <c>record struct</c> con inicializadores de campo lo exige
        /// (CS8983) y evita que un string nulo se slingue por el grafo de objetos.
        /// </summary>
        public BudgetItemMatchInput()
        {
            ItemKind = string.Empty;
            TransactionType = string.Empty;
            PeriodKey = string.Empty;
        }

        public int ItemId { get; init; }
        public int TransactionId { get; init; }

        /// <summary><c>income</c> o <c>expense</c>.</summary>
        public string ItemKind { get; init; } = string.Empty;

        /// <summary>Tipo de la transacción (<c>income</c>, <c>expense</c>, <c>transfer</c>, <c>opening_credit</c>).</summary>
        public string TransactionType { get; init; } = string.Empty;

        /// <summary><c>yyyy-MM</c> de la partida. Es derivado de <see cref="PlannedDate"/>, no del cliente.</summary>
        public string PeriodKey { get; init; } = string.Empty;

        public decimal PlannedAmount { get; init; }

        /// <summary>Fecha esperada. Abre la ventana de matching de la partida.</summary>
        public DateOnly PlannedDate { get; init; }

        /// <summary>Scope de la partida: exactamente uno de categoría o subcategoría (XOR en SQL).</summary>
        public int? ItemCategoryId { get; init; }

        public int? ItemSubcategoryId { get; init; }
        public int? ItemAccountId { get; init; }
        public int? ItemMerchantId { get; init; }

        public int? TransactionCategoryId { get; init; }
        public int? TransactionSubcategoryId { get; init; }
        public int? TransactionAccountId { get; init; }
        public int? TransactionMerchantId { get; init; }

        public decimal TransactionAmount { get; init; }

        /// <summary>
        /// Día local de la transacción (<c>America/Mexico_City</c> vía <c>MonthRangeResolver</c>).
        /// Es la fecha contra la que se compara <see cref="PlannedDate"/>: la ventana y la distancia
        /// son reglas de día, y comparar instantes UTC correría el día.
        /// </summary>
        public DateOnly TransactionLocalDate { get; init; }
    }

    /// <summary>Par ya evaluado: la fuerza que decidió la regla y a cuántos días cae de la fecha planificada.</summary>
    public readonly record struct BudgetItemMatchCandidate
    {
        public BudgetItemMatchCandidate()
        {
            Input = default;
        }

        public BudgetItemMatchInput Input { get; init; }

        public BudgetItemMatchStrength Strength { get; init; }

        /// <summary>Días de distancia entre la fecha planificada y el día local de la transacción.</summary>
        public int DistanceDays { get; init; }
    }

    /// <summary>Desenlace tipado del intento de enlace. Nunca lleva montos ni nombres (se registra en logs).</summary>
    public enum BudgetItemMatchOutcomeStatus
    {
        /// <summary>La partida quedó <c>executed</c> y enlazada a la transacción.</summary>
        Linked = 0,

        /// <summary>Ninguna partida del usuario cumple una regla fuerte para esa transacción.</summary>
        NoCandidate = 1,

        /// <summary>La partida ya tenía transacción o la transacción ya estaba enlazada: no-op.</summary>
        AlreadyLinked = 2
    }

    /// <summary>Resultado de <c>TryMatchTransactionAsync</c>. Sin montos y sin nombres a propósito.</summary>
    public sealed class BudgetItemMatchOutcome
    {
        public BudgetItemMatchOutcomeStatus Status { get; set; }

        public int TransactionId { get; set; }

        /// <summary>Partida enlazada. Null salvo <see cref="BudgetItemMatchOutcomeStatus.Linked"/>.</summary>
        public int? ItemId { get; set; }

        public static BudgetItemMatchOutcome Linked(int transactionId, int itemId) => new()
        {
            Status = BudgetItemMatchOutcomeStatus.Linked,
            TransactionId = transactionId,
            ItemId = itemId
        };

        public static BudgetItemMatchOutcome NoCandidate(int transactionId) => new()
        {
            Status = BudgetItemMatchOutcomeStatus.NoCandidate,
            TransactionId = transactionId
        };

        public static BudgetItemMatchOutcome AlreadyLinked(int transactionId) => new()
        {
            Status = BudgetItemMatchOutcomeStatus.AlreadyLinked,
            TransactionId = transactionId
        };
    }

    /// <summary>
    /// Sugerencia de match <b>débil</b>: la misma categoría/subcategoría en el mismo mes. Se lista
    /// para que el usuario decida; el servicio que la produce no escribe nada.
    /// </summary>
    public sealed class BudgetItemSuggestion
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
        public DateTime TransactionDate { get; set; }

        /// <summary>Días entre la fecha planificada y el día local de la transacción.</summary>
        public int DistanceDays { get; set; }

        /// <summary>Siempre <c>weak</c>: la lista solo expone candidatas débiles.</summary>
        public string Strength { get; set; } = BudgetItemMatchStrength.Weak.ToString().ToLowerInvariant();
    }
}
