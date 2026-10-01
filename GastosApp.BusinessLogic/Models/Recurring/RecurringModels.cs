namespace GastosApp.BusinessLogic.Models.Recurring
{
    /// <summary>
    /// Entrada de creación/edición de una plantilla de programado. El scope es XOR: exactamente uno
    /// de <see cref="CategoryId"/> o <see cref="SubcategoryId"/>. <c>day_of_month</c> describe la
    /// periodicidad de los meses siguientes; <see cref="EffectiveFrom"/> solo gobierna el arranque.
    /// </summary>
    public class RecurringItemWriteInput
    {
        /// <summary><c>income</c> o <c>expense</c>. Inmutable tras el alta.</summary>
        public string Kind { get; set; } = string.Empty;

        public string Name { get; set; } = string.Empty;

        /// <summary><c>fixed</c> (monto declarado) o <c>average</c> (promedio del historial).</summary>
        public string? AmountMode { get; set; }

        public decimal? AmountMxn { get; set; }

        public int DayOfMonth { get; set; }

        public int? CategoryId { get; set; }

        public int? SubcategoryId { get; set; }

        public int? AccountId { get; set; }

        public int? MerchantId { get; set; }

        /// <summary>Primer periodo (<c>yyyy-MM</c>) en que la plantilla aplica.</summary>
        public string? StartsPeriod { get; set; }

        public string? EndsPeriod { get; set; }

        /// <summary>Solo válido para gasto con cuenta y con salida de Telegram configurada.</summary>
        public bool AutoExecute { get; set; }

        /// <summary>Fecha de entrada en vigor decidida a mano. Nunca anterior al mes en curso.</summary>
        public DateTime? EffectiveFrom { get; set; }
    }

    /// <summary>Fila del catálogo de programados. No incluye montos derivados ni credenciales.</summary>
    public class RecurringItemDetail
    {
        public int RecurringItemId { get; set; }
        /// <summary><c>income</c> o <c>expense</c>.</summary>
        public string Kind { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        /// <summary><c>fixed</c> o <c>average</c>.</summary>
        public string AmountMode { get; set; } = string.Empty;
        /// <summary>Nulo en modo promedio: el monto se deriva del historial ejecutado.</summary>
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

    /// <summary>Filtros del catálogo. Todos opcionales; el alcance lo impone el <c>userId</c> del token.</summary>
    public class RecurringItemQuery
    {
        public string? Kind { get; set; }
        public bool? Active { get; set; }
    }

    /// <summary>
    /// Disponibilidad de la salida de Telegram. POCO inmutable y sin secretos: solo expone el
    /// resultado de combinar <c>Telegram:Enabled</c>, <c>BotToken</c> y <c>AllowedUserId</c>.
    /// Vive en BusinessLogic para que el guardado y el motor compartan la misma decisión sin que
    /// el dominio vea el token.
    /// </summary>
    public sealed class RecurringItemSettings
    {
        /// <summary><c>Plan:AverageMonths</c>. Meses con historial ejecutado que promedian el monto.</summary>
        public int AverageMonths { get; init; } = 3;

        /// <summary>
        /// <c>Plan:MatchTolerancePct</c>. Tolerancia de monto del auto-match (sección 4.4).
        /// La consume la Fase 3.4; se declara aquí para no abrir una segunda superficie de configuración.
        /// </summary>
        public decimal MatchTolerancePct { get; init; }

        /// <summary>
        /// <c>true</c> solo si <c>Telegram:Enabled</c> está activo, el <c>BotToken</c> no es un
        /// placeholder y <c>AllowedUserId &gt; 0</c>. Único requisito para permitir <c>auto_execute</c>
        /// (secciones 4.6 regla 3-bis y 7.4): sin salida de alertas, una programada que mueve dinero
        /// sería invisible.
        /// </summary>
        public bool TelegramAlertingAvailable { get; init; }
    }

    /// <summary>Resultado del guardado desde el histórico. Nunca expone id de transacción ajeno.</summary>
    public class RecurringItemFromTransactionResult
    {
        /// <summary><c>true</c> cuando solo se propuso: cero filas escritas.</summary>
        public bool DryRun { get; set; }

        /// <summary><c>true</c> cuando la plantilla se persistió.</summary>
        public bool Written { get; set; }

        /// <summary>Propuesta derivada de la transacción (o la plantilla recién creada).</summary>
        public RecurringItemDetail? Template { get; set; }

        /// <summary>Plantilla que ya ocupaba <c>(userId, kind, name)</c> cuando hubo colisión.</summary>
        public RecurringItemDetail? Existing { get; set; }

        /// <summary><c>true</c> cuando la idempotencia impidió crear un duplicado (criterio 21).</summary>
        public bool Conflict { get; set; }
    }

    /// <summary>
    /// Soporte del checkbox <c>autoExecute</c> en la UI: permite deshabilitarlo con explicación
    /// en vez de que el usuario choque con un 400 (sección 7.4). Sin credenciales ni <c>chat_id</c>.
    /// </summary>
    public class RecurringItemConfigResult
    {
        public bool AutoExecuteAvailable { get; set; }
        public string? Reason { get; set; }
    }

    /// <summary>
    /// Materialización de ocurrencias de un periodo. Solo conteos: nunca montos ni nombres.
    /// <see cref="Attempted"/> = candidatas aplicables; <see cref="Skipped"/> = la clave
    /// <c>(user, periodo, kind, nombre)</c> ya existía; <see cref="Omitted"/> = candidata descartada
    /// sin intentar insertar (monto promedio sin historial).
    /// </summary>
    public class RecurringMaterializationResult
    {
        public string PeriodKey { get; set; } = string.Empty;
        public int Attempted { get; set; }
        public int Inserted { get; set; }
        public int Skipped { get; set; }
        public int Omitted { get; set; }
    }

    /// <summary>
    /// Corrida del motor de ejecución automática. Solo conteos: el payload del aviso nunca sale
    /// de la base de datos.
    /// </summary>
    public class RecurringExecutionResult
    {
        public string PeriodKey { get; set; } = string.Empty;

        /// <summary>Conteos de la materialización del periodo en curso, previa a la ejecución.</summary>
        public int Materialized { get; set; }

        /// <summary>Transacciones creadas en esta corrida.</summary>
        public int Executed { get; set; }

        /// <summary>Avisos de ejecución encolados (post-commit).</summary>
        public int NoticesQueued { get; set; }

        /// <summary>
        /// <c>true</c> cuando no había salida de Telegram: el motor no creó ninguna transacción y
        /// dejó las partidas <c>pending</c> (degradación a lo seguro, sección 7.4).
        /// </summary>
        public bool ExecutionSkipped { get; set; }
    }
}
