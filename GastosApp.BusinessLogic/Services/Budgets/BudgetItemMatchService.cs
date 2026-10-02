using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// Cumple partidas planificadas con transacciones reales (sección 4.4 del plan). El alcance
    /// siempre se acota por el <c>userId</c> recibido del token: nunca se confía en ids ajenos.
    /// Ningún monto, nombre ni descripción se registra en logs; lo que se devuelve al llamador es
    /// un resultado tipado y sin datos financieros.
    /// </summary>
    /// <remarks>
    /// <b>Por qué solo la regla fuerte escribe.</b> La débil —"misma categoría/subcategoría en el
    /// mismo mes"— acierta seguido pero no identifica: varias partidas y varios gastos pueden
    /// compartir categoría, y enlazar la equivocada saca el monto de una partida del comprometido
    /// sin que nadie lo haya decidido. Por eso la débil se limita a <see cref="SuggestAsync"/> y el
    /// enlace automático exige comercio, o cuenta + alcance.
    /// <para><b>La ventana es de las dos.</b> El plan §4.4 punto 1 la enuncia antes de la lista de
    /// fuerzas, así que se exige también para la sugerencia: <c>planned_date</c> → fin de mes, con
    /// la única excepción del pago tardío de un periodo ya cerrado (§4.4 punto 4), que no tiene tope
    /// de meses y solo aplica por fuerza fuerte.</para>
    /// <para><b>Ambigüedad conocida del desempate, escrita y no resuelta.</b> Dos partidas
    /// <c>pending</c> idénticas —mismo comercio y mismo monto— de <i>periodos distintos</i> pueden
    /// ser fuerte para la misma transacción a la vez, y el plan §4.4 no dice cuál gana. El
    /// comportamiento que este servicio tiene, y que se deja explícito para que la elección sea
    /// auditable y no parezca un accidente, es: <b>gana la de fecha elegible más cercana a la
    /// transacción</b> (§4.4 punto 3, medido contra <c>planned_date</c> con
    /// <see cref="BudgetItemMatcher.SelectBest"/>) y, a igual distancia, la de <b>menor
    /// <c>ItemId</c></b>, que es el desempate estable de esa misma regla. No es una preferencia
    /// escrita por el plan: es la lectura más fiel de "la más cercana", y cambiar la elección —
    /// por ejemplo, preferir siempre el periodo más reciente o el más antiguo— cambiaría el
    /// resultado de un enlace ya determinista y exigiría una decisión nueva, no un arreglo.</para>
    /// </remarks>
    public class BudgetItemMatchService : IBudgetItemMatchService
    {
        // Índice único parcial uq_budget_items_transaction. Vive solo en SQL, por eso se reconoce
        // por nombre en el error de Postgres (mismo criterio que BudgetItemService).
        private const string TransactionUniqueIndexName = "uq_budget_items_transaction";

        /// <summary>
        /// Válvula de seguridad de <see cref="LoadCandidateItemsAsync"/>, <b>no una regla de
        /// negocio</b>: acota cuántas filas trae la consulta cuando un usuario arrastra muchísimas
        /// partidas <c>pending</c> <i>que la transacción ya hace plausibles</i> (mismo <c>kind</c>,
        /// dentro de la ventana de periodo y con comercio o cuenta+alcance y monto en banda).
        /// No significa "solo se reconcilia el último mes": la lista entra ordenada por cercanía a
        /// la fecha de la transacción, así que lo que se descarta es lo más lejano.
        /// <para><b>Por qué ya no puede tragarse a la única coincidencia legítima.</b> Antes el corte
        /// venía <i>antes</i> del filtro fuerte: la consulta traía las partidas más recientes por
        /// cercanía y el <c>Take</c> se cobraba antes de que nada comprobara comercio ni monto, así
        /// que 200 señuelos de otro comercio desplazaban a la única partida que de verdad podía
        /// enlazar y el pago se quedaba sin reconciliar. Ahora el corte cae sobre un conjunto ya
        /// selectivo —candidatas por identidad y monto— y la única fila que el plan reconoce como
        /// fuerte para esta transacción está entre las que la consulta trae, porque la consulta
        /// exige precisamente las condiciones que la harían fuerte. Sigue siendo un tope
        /// numérico y, si alguna vez alcanzara a truncar el conjunto plausible, debería ser un
        /// parámetro documentado en el plan, no un número en el código.</para>
        /// </summary>
        private const int MaxCandidateItems = 200;

        /// <summary>
        /// Holgura de un centavo que la banda de monto de SQL concede sobre el umbral exacto.
        /// Existe solo porque el umbral de <see cref="BudgetItemMatcher.IsAmountWithinTolerance"/>
        /// se redondea a 2 decimales y <c>ROUND</c> no se traduce en la consulta: la banda de SQL
        /// es <i>más ancha</i> que la regla (por eso no puede excluir una coincidencia legítima) y
        /// el borde lo sigue decidiendo, exacto, la revalidación en memoria.
        /// </summary>
        private const decimal AmountBandSlack = 0.01m;

        private readonly IRepository _repository;
        private readonly PlanMatchSettings _settings;

        public BudgetItemMatchService(IRepository repository, PlanMatchSettings settings)
        {
            _repository = repository;
            _settings = settings;
        }

        public async Task<BudgetItemMatchOutcome> TryMatchTransactionAsync(
            int appUserId,
            int transactionId,
            CancellationToken cancellationToken)
        {
            // El día local, no el instante: la ventana de la partida y la distancia son reglas de
            // día, y comparar contra el UTC correría el día de cualquier transacción de la tarde.
            var transaction = await _repository.Get<Transaction>(t =>
                    t.TransactionId == transactionId &&
                    t.Account.UserId == appUserId)
                .Select(t => new
                {
                    t.TransactionId,
                    t.Type,
                    t.Amount,
                    t.CategoryId,
                    t.SubcategoryId,
                    t.AccountId,
                    t.MerchantId,
                    t.TransactionDate
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (transaction == null)
            {
                return BudgetItemMatchOutcome.NoCandidate(transactionId);
            }

            // Idempotencia (1): la transacción ya cumple una partida. Una sola fila por transacción
            // es justo lo que garantiza uq_budget_items_transaction, así que reintentar solo
            // produciría un error de índice.
            var alreadyLinked = await _repository.Get<BudgetItem>(i => i.TransactionId == transactionId)
                .AnyAsync(cancellationToken);

            if (alreadyLinked)
            {
                return BudgetItemMatchOutcome.AlreadyLinked(transactionId);
            }

            var localDateTime = MonthRangeResolver.ResolveLocalDate(transaction.TransactionDate);
            var localDate = DateOnly.FromDateTime(localDateTime);
            var transactionPeriodKey = BudgetItemMatcher.PeriodKeyOf(localDate);
            var tolerancePct = _settings.MatchTolerancePct;

            // Se evalúa y se escribe dentro de una sola transacción de BD: la elección y el enlace
            // ven la misma foto. El filtro de partida (pending, sin enlace, mismo usuario) va en la
            // consulta y no después, así que la lista de candidatas ya viene acotada.
            return await _repository.ExecuteInTransactionAsync(async () =>
            {
                // Lectura SIN seguimiento (AsNoTracking, el default de IRepository.Get): la partida
                // elegida se vuelve a leer bajo bloqueo de fila en LinkAsync, y EF no refresca una
                // entidad ya rastreada. Rastrear aquí dejaría esa relectura con valores rancios y el
                // enlace dejaría de ser atómico.
                var items = await LoadCandidateItemsAsync(
                    appUserId,
                    localDateTime,
                    transactionPeriodKey,
                    transaction.Type,
                    transaction.Amount,
                    transaction.MerchantId,
                    transaction.AccountId,
                    transaction.CategoryId,
                    transaction.SubcategoryId,
                    tolerancePct,
                    cancellationToken);

                if (items.Count == 0)
                {
                    return BudgetItemMatchOutcome.NoCandidate(transactionId);
                }

                var candidates = items.Select(item => BudgetItemMatcher.Evaluate(
                    new BudgetItemMatchInput
                    {
                        ItemId = item.ItemId,
                        ItemKind = item.Kind,
                        ItemCategoryId = item.CategoryId,
                        ItemSubcategoryId = item.SubcategoryId,
                        ItemAccountId = item.AccountId,
                        ItemMerchantId = item.MerchantId,
                        PeriodKey = item.PeriodKey,
                        PlannedAmount = item.PlannedAmount,
                        PlannedDate = DateOnly.FromDateTime(item.PlannedDate),
                        TransactionId = transaction.TransactionId,
                        TransactionType = transaction.Type,
                        TransactionCategoryId = transaction.CategoryId,
                        TransactionSubcategoryId = transaction.SubcategoryId,
                        TransactionAccountId = transaction.AccountId,
                        TransactionMerchantId = transaction.MerchantId,
                        TransactionAmount = transaction.Amount,
                        TransactionLocalDate = localDate
                    },
                    tolerancePct,
                    // Excepción a la ventana (sección 4.4 punto 4): una partida pending de un
                    // periodo ya cerrado se enlaza igual, sin tope de meses y solo por fuerza fuerte.
                    // Es un ajuste de reporte, no de caja.
                    periodIsClosed: !MonthRangeResolver.IsPeriodOpen(item.PeriodKey)));

                var best = BudgetItemMatcher.SelectBest(candidates);
                if (best == null)
                {
                    return BudgetItemMatchOutcome.NoCandidate(transactionId);
                }

                return await LinkAsync(appUserId, best.Value.Input.ItemId, transactionId, cancellationToken);
            });
        }

        public async Task<IReadOnlyList<BudgetItemSuggestion>> SuggestAsync(
            int appUserId,
            string period,
            CancellationToken cancellationToken)
        {
            var periodKey = NormalizePeriodKey(period);

            // Solo partidas que todavía pueden cumplirse: pending y sin transacción enlazada. Una
            // partida ejecutada ya tiene su gasto y una cancelada liberó su monto.
            var items = await _repository.Get<BudgetItem>(i =>
                    i.UserId == appUserId &&
                    i.PeriodKey == periodKey &&
                    i.Status == BudgetItemStatus.Pending &&
                    i.TransactionId == null)
                .Select(i => new
                {
                    i.ItemId,
                    i.Kind,
                    i.Name,
                    i.PlannedAmount,
                    i.PlannedDate,
                    i.CategoryId,
                    i.SubcategoryId,
                    i.AccountId,
                    i.MerchantId
                })
                .ToListAsync(cancellationToken);

            if (items.Count == 0)
            {
                return Array.Empty<BudgetItemSuggestion>();
            }

            var (_, _, startUtc, nextStartUtc) = MonthRangeResolver.ResolveUtcRange(periodKey, null);

            // El filtro por scope va en la consulta para no materializar el producto cartesiano
            // (partidas × gastos del mes) en memoria.
            var categoryIds = items.Where(i => i.CategoryId.HasValue).Select(i => i.CategoryId!.Value).ToList();
            var subcategoryIds = items.Where(i => i.SubcategoryId.HasValue).Select(i => i.SubcategoryId!.Value).ToList();

            // Se excluyen las transacciones ya enlazadas a alguna partida: sugerir una sería ofrecer
            // un enlace que uq_budget_items_transaction rechaza. transfer y opening_credit quedan
            // fuera por kind: no existe partida de esos tipos.
            var transactions = await _repository.Get<Transaction>(t =>
                    t.Account.UserId == appUserId &&
                    t.TransactionDate >= startUtc &&
                    t.TransactionDate < nextStartUtc &&
                    (t.Type == TransactionDomainConstants.TransactionType.Income ||
                     t.Type == TransactionDomainConstants.TransactionType.Expense) &&
                    (t.CategoryId.HasValue && categoryIds.Contains(t.CategoryId.Value) ||
                     t.SubcategoryId.HasValue && subcategoryIds.Contains(t.SubcategoryId.Value)) &&
                    !_repository.Get<BudgetItem>().Any(linked => linked.TransactionId == t.TransactionId))
                .Select(t => new
                {
                    t.TransactionId,
                    t.Type,
                    t.Amount,
                    t.CategoryId,
                    t.SubcategoryId,
                    t.TransactionDate
                })
                .ToListAsync(cancellationToken);

            if (transactions.Count == 0)
            {
                return Array.Empty<BudgetItemSuggestion>();
            }

            var tolerancePct = _settings.MatchTolerancePct;
            var inputs = new List<BudgetItemMatchInput>(items.Count * transactions.Count);

            foreach (var item in items)
            {
                foreach (var candidate in transactions)
                {
                    inputs.Add(new BudgetItemMatchInput
                    {
                        ItemId = item.ItemId,
                        ItemKind = item.Kind,
                        ItemCategoryId = item.CategoryId,
                        ItemSubcategoryId = item.SubcategoryId,
                        ItemAccountId = item.AccountId,
                        ItemMerchantId = item.MerchantId,
                        PeriodKey = periodKey,
                        PlannedAmount = item.PlannedAmount,
                        PlannedDate = DateOnly.FromDateTime(item.PlannedDate),
                        TransactionId = candidate.TransactionId,
                        TransactionType = candidate.Type,
                        TransactionCategoryId = candidate.CategoryId,
                        TransactionSubcategoryId = candidate.SubcategoryId,
                        TransactionAmount = candidate.Amount,
                        TransactionLocalDate = DateOnly.FromDateTime(
                            MonthRangeResolver.ResolveLocalDate(candidate.TransactionDate))
                    });
                }
            }

            var weak = BudgetItemMatcher.SelectWeak(inputs, tolerancePct);
            if (weak.Count == 0)
            {
                return Array.Empty<BudgetItemSuggestion>();
            }

            var itemsById = items.ToDictionary(i => i.ItemId);
            var suggestions = new List<BudgetItemSuggestion>(weak.Count);

            foreach (var candidate in weak)
            {
                var item = itemsById[candidate.Input.ItemId];
                suggestions.Add(new BudgetItemSuggestion
                {
                    ItemId = item.ItemId,
                    PeriodKey = periodKey,
                    Kind = item.Kind,
                    Name = item.Name,
                    PlannedAmount = item.PlannedAmount,
                    PlannedDate = item.PlannedDate,
                    CategoryId = item.CategoryId,
                    SubcategoryId = item.SubcategoryId,
                    AccountId = item.AccountId,
                    MerchantId = item.MerchantId,
                    TransactionId = candidate.Input.TransactionId,
                    TransactionAmount = candidate.Input.TransactionAmount,
                    TransactionDate = candidate.Input.TransactionLocalDate.ToDateTime(TimeOnly.MinValue),
                    DistanceDays = candidate.DistanceDays
                });
            }

            return suggestions;
        }

        /// <summary>
        /// Candidatas de una transacción en <b>una sola consulta acotada</b>: el periodo propio de la
        /// transacción (ventana normal, §4.4 punto 1) y <b>cualquier</b> periodo anterior ya cerrado
        /// (pago tardío, §4.4 punto 4) — sin tope de meses, porque el plan no fija ninguno.
        /// </summary>
        /// <remarks>
        /// <para><b>Por qué el filtro de <c>planned_date</c>.</b> La ventana abre en
        /// <c>planned_date</c>, así que una partida cuya fecha planificada cae <i>después</i> del día
        /// local de la transacción no puede ser candidata de ninguna fuerza: es un cargo anticipado,
        /// no un pago tardío. Exigirlo en la consulta tiene un beneficio exacto — con todas las
        /// candidatas en <c>planned_date ≤ fechaTransacción</c>, ordenar por <c>planned_date DESC</c>
        /// <b>es</b> ordenar por cercanía a esa fecha, sin una sola resta de fechas en SQL y sin
        /// depender de la zona horaria de la sesión.</para>
        /// <para><b>Por qué el filtro de periodo.</b> Son las dos mitades de la regla: el periodo
        /// propio de la transacción es la ventana normal (§4.4 punto 1), y
        /// <c>period_key &lt; periodoActual</c> es exactamente "periodo cerrado" —la inversa de
        /// <see cref="MonthRangeResolver.IsPeriodOpen"/>—, que es donde la excepción del pago tardío
        /// (§4.4 punto 4) puede aplicar, sin tope de meses. Ninguna otra forma de periodo se cuela: un
        /// periodo <i>posterior</i> a la transacción tendría su <c>planned_date</c> después del día local
        /// y ya quedó fuera por el filtro anterior, y un periodo abierto anterior no aporta nada porque
        /// la excepción exige cerrado. La comparación de <c>char(7)</c> es la del formato
        /// <c>yyyy-MM</c> rellenado con ceros, la misma que usa
        /// <see cref="MonthRangeResolver.IsPeriodOpen"/> en memoria.</para>
        /// <para><b>Por qué un <c>Take</c>.</b> Ver <see cref="MaxCandidateItems"/>: es una válvula
        /// de seguridad sobre el tamaño del resultado, no una regla de negocio — y ahora cae sobre un
        /// conjunto que la propia consulta ya hace plausible, de modo que ya no puede tragarse a la
        /// única coincidencia legítima. La decisión de qué se enlaza la sigue tomando
        /// <see cref="BudgetItemMatcher.SelectBest"/> sobre lo cargado, con su desempate estable por
        /// <c>ItemId</c>.</para>
        /// </remarks>
        private async Task<List<BudgetItem>> LoadCandidateItemsAsync(
            int appUserId,
            DateTime transactionLocalDateTime,
            string transactionPeriodKey,
            string transactionKind,
            decimal transactionAmount,
            int? transactionMerchantId,
            int? transactionAccountId,
            int? transactionCategoryId,
            int? transactionSubcategoryId,
            decimal tolerancePct,
            CancellationToken cancellationToken)
        {
            var currentPeriodKey = MonthRangeResolver.CurrentPeriodKey();

            // La banda de monto se empuja como superconjunto de la regla exacta: el umbral real se
            // redondea a 2 decimales (MidpointRounding.AwayFromZero) y Math.Round NO lo traduce EF
            // Core contra Npgsql —se prueba en el harness, falla en tiempo de ejecución—, así que SQL
            // solo puede decir "dentro de |planned|·pct/100 más un centavo de holgura". Un centavo
            // siempre alcanza el error de redondeo a 2 decimales (máx. medio centavo), de modo que la
            // banda de SQL contiene a la exacta y no puede excluir una coincidencia legítima; el
            // borde lo decide IsAmountWithinTolerance al reevaluar cada par en memoria. El signo se
            // toma en magnitud, igual que en la regla: Math.Abs se traduce a abs() en PostgreSQL.
            var bandPct = tolerancePct > 0m ? tolerancePct / 100m : 0m;
            var bandSlack = tolerancePct > 0m ? AmountBandSlack : 0m;

            // kind: budget_items.kind y transactions.type son columnas distintas y el match es
            // ordinal ignorando mayúsculas (BudgetItemMatcher.IsSameKind). La comparación cruda
            // "i.Kind == tipo" NO es equivalente —PostgreSQL la resuelve con collation— y además es
            // más estrecha: aquí se baja a minúsculas para que SQL y memoria coincidan exactamente.
            var kind = (transactionKind ?? string.Empty).Trim().ToLowerInvariant();

            return await _repository.Get<BudgetItem>(i =>
                    i.UserId == appUserId &&
                    i.Status == BudgetItemStatus.Pending &&
                    i.TransactionId == null &&
                    i.Kind.ToLower() == kind &&
                    i.PlannedDate <= transactionLocalDateTime &&
                    // i.PeriodKey < currentPeriodKey con el operador de C# no compila dentro de un
                    // IQueryable, y string.CompareOrdinal NO lo traduce EF Core (falla en tiempo de
                    // ejecución, no de compilación). CompareTo sí se traduce a la comparación de
                    // PostgreSQL, y para claves yyyy-MM rellenadas con ceros es el mismo orden que
                    // usa MonthRangeResolver.IsPeriodOpen en memoria.
                    (i.PeriodKey == transactionPeriodKey || i.PeriodKey.CompareTo(currentPeriodKey) < 0) &&
                    // Los dos caminos de la regla fuerte (BudgetItemMatcher.IsStrongMatch), en la
                    // misma forma en que la memoria los evalúa. Se escriben como OR —no como
                    // "si hay comercio, solo comercio" porque una partida sin comercio también puede
                    // ser fuerte por cuenta + alcance con monto exacto, y esa partida es legítima: el
                    // filtro de SQL tiene que ser superconjunto de las fuertes, nunca más estrecho.
                    //
                    // Camino 1 (comercio + monto dentro de la banda): los dos ids deben existir —
                    // dos nulos no son "el mismo comercio" (IsStrongMatch), y merchant_id IS NULL
                    // en ambos lados sería un match que la regla rechaza.
                    ((transactionMerchantId.HasValue &&
                      i.MerchantId.HasValue &&
                      i.MerchantId == transactionMerchantId &&
                      Math.Abs(i.PlannedAmount) * bandPct + bandSlack >= Math.Abs(transactionAmount - i.PlannedAmount)) ||
                     // Camino 2 (cuenta + alcance + monto EXACTO, sin tolerancia: el plan la pide
                     // exacta en esta rama). El alcance XOR de ck_budget_items_scope se reproduce con
                     // el mismo CASE que IsSameScope: subcategoría si la tiene, categoría si no.
                     (transactionAccountId.HasValue &&
                      i.AccountId.HasValue &&
                      i.AccountId == transactionAccountId &&
                      i.PlannedAmount == transactionAmount &&
                      (i.SubcategoryId.HasValue
                          ? i.SubcategoryId == transactionSubcategoryId
                          : i.CategoryId.HasValue && i.CategoryId == transactionCategoryId))))
                .OrderByDescending(i => i.PlannedDate)
                .ThenBy(i => i.ItemId)
                .Take(MaxCandidateItems)
                .ToListAsync(cancellationToken);
        }

        /// <summary>
        /// Enlaza la partida elegida con <c>status='executed'</c> y <c>transaction_id</c> juntos,
        /// porque <c>ck_budget_items_executed</c> exige que se sostengan mutuamente.
        /// </summary>
        /// <remarks>
        /// <para><b>El enlace es atómico</b> porque la fila se bloquea con
        /// <c>SELECT … FOR UPDATE</c> antes de leerse, y no después: la guardia "si
        /// <c>transaction_id</c> ya está, no hagas nada" es de lectura-y-luego-escritura, y dos altas
        /// concurrentes podían leer <c>null</c> las dos y escribir las dos —la segunda pisando el
        /// enlace de la primera, que dejaba una transacción contada como gasto normal mientras su
        /// partida aparecía como ejecutada. Con el bloqueo, la segunda espera al commit de la primera
        /// y relee la fila ya enlazada: un acierto de 0 filas —o un no-op— no es un fallo, es la otra
        /// vía ganando.</para>
        /// <para>El bloqueo solo serializa la misma partida. El caso simétrico —<b>una</b> transacción
        /// que dos partidas quieren reclamar— lo cubre
        /// <c>uq_budget_items_transaction</c>, que se sigue tratando como carrera ya resuelta.</para>
        /// </remarks>
        private async Task<BudgetItemMatchOutcome> LinkAsync(
            int appUserId,
            int itemId,
            int transactionId,
            CancellationToken cancellationToken)
        {
            // La lectura va bajo bloqueo de fila y con seguimiento: al no haber sido rastreada antes
            // (LoadCandidateItemsAsync usa AsNoTracking), los valores son los de la fila ya
            // bloqueada, no los de una lectura anterior que ya quedó vieja.
            var item = await _repository.LockBudgetItemAsync(itemId, appUserId);

            // Idempotencia (2), revalidada contra la fila bloqueada: entre elegir y escribir, la
            // partida pudo cambiar. Con el candado, "cambió" solo puede significar que otro enlace se
            // confirmó primero, y entonces el no-op es la respuesta correcta, no un error.
            if (item == null ||
                item.Status != BudgetItemStatus.Pending ||
                item.TransactionId.HasValue)
            {
                return BudgetItemMatchOutcome.AlreadyLinked(transactionId);
            }

            // Atajo para el caso simétrico: evita provocar a propósito la violación del índice. No
            // es la garantía —una comprobación más también es lectura-y-luego-escritura—: la garantía
            // es el índice único, y este chequeo solo evita el trabajo inútil.
            var claimedByOther = await _repository.Get<BudgetItem>(i => i.TransactionId == transactionId)
                .AnyAsync(cancellationToken);

            if (claimedByOther)
            {
                return BudgetItemMatchOutcome.AlreadyLinked(transactionId);
            }

            item.Status = BudgetItemStatus.Executed;
            item.TransactionId = transactionId;

            try
            {
                await _repository.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (IsTransactionLinkRace(ex))
            {
                // Idempotencia (3): otra petición ganó el enlace entre la revalidación y el UPDATE.
                // Es una carrera ya resuelta, no un fallo —quedan enlazados, solo que por la otra
                // vía—, así que se devuelve como no-op en vez de propagar el error al llamador.
                return BudgetItemMatchOutcome.AlreadyLinked(transactionId);
            }

            return BudgetItemMatchOutcome.Linked(transactionId, itemId);
        }

        private static string NormalizePeriodKey(string period)
        {
            var parsed = DateTime.TryParseExact(
                period,
                "yyyy-MM",
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None,
                out _);

            if (!parsed)
            {
                throw new ArgumentException("period must use yyyy-MM format.", nameof(period));
            }

            return period;
        }

        /// <summary>
        /// Carrera sobre <c>uq_budget_items_transaction</c>, reconocida por nombre porque el índice
        /// vive solo en SQL.
        /// </summary>
        private static bool IsTransactionLinkRace(DbUpdateException ex)
        {
            return ex.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: TransactionUniqueIndexName
            };
        }
    }
}
