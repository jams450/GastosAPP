using System.Globalization;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.BusinessLogic.Models.Recurring;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// Catálogo de programados, materialización de ocurrencias, rollover de plan y motor de
    /// ejecución automática de gastos. El alcance siempre se acota por el <c>userId</c> recibido del
    /// token: nunca se confía en ids del payload. Ningún monto, nombre ni payload se registra en logs.
    /// </summary>
    public class RecurringItemService : IRecurringItemService
    {
        // Índices únicos que solo existen en SQL. Se reconocen por nombre en el error de Postgres
        // para traducir una carrera al error de dominio correcto en vez de un 500.
        private const string TemplateNameIndexName = "uq_recurring_items_user_kind_name";
        private const string BudgetScopeIndexName = "ux_budgets_user_period_scope";

        private const int MaxNameLength = 120;

        /// <summary>
        /// Cuántos meses hacia atrás se exploran por cada mes requerido al promediar. Evita que una
        /// racha larga sin movimientos obligue a leer el historial completo en cada materialización.
        /// </summary>
        private const int AverageLookbackFactor = 4;

        /// <summary>Nombre derivado de una transacción sin descripción útil (sección 5).</summary>
        private const string DerivedNameFallback = "Programado";

        private readonly IRepository _repository;
        private readonly ITransactionCommandService _transactionCommandService;
        private readonly RecurringItemSettings _settings;

        public RecurringItemService(
            IRepository repository,
            ITransactionCommandService transactionCommandService,
            RecurringItemSettings settings)
        {
            _repository = repository;
            _transactionCommandService = transactionCommandService;
            _settings = settings;
        }

        public async Task<IReadOnlyList<RecurringItemDetail>> ListAsync(int userId, RecurringItemQuery query)
        {
            var kind = NormalizeKindOrNull(query.Kind);

            return await _repository.Get<RecurringItem>(r =>
                    r.UserId == userId &&
                    (kind == null || r.Kind == kind) &&
                    (query.Active == null || r.Active == query.Active.Value))
                .OrderBy(r => r.Kind)
                .ThenBy(r => r.Name)
                .Select(RecurringItemProjection)
                .ToListAsync();
        }

        public async Task<RecurringItemDetail?> GetAsync(int recurringItemId, int userId)
        {
            return await _repository.Get<RecurringItem>(r =>
                    r.RecurringItemId == recurringItemId && r.UserId == userId)
                .Select(RecurringItemProjection)
                .FirstOrDefaultAsync();
        }

        public async Task<RecurringItemDetail> CreateAsync(int userId, RecurringItemWriteInput input)
        {
            if (input == null) throw new ArgumentException("Recurring item input is required.", nameof(input));

            var draft = await BuildValidatedEntityAsync(userId, input, existing: null);

            try
            {
                var saved = await _repository.Save(draft);
                return (await GetAsync(saved.RecurringItemId, userId))!;
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex, TemplateNameIndexName))
            {
                throw new ArgumentException(
                    "A recurring item with the same kind and name already exists.",
                    nameof(input));
            }
        }

        public async Task<RecurringItemDetail?> UpdateAsync(int recurringItemId, int userId, RecurringItemWriteInput input)
        {
            if (input == null) throw new ArgumentException("Recurring item input is required.", nameof(input));

            var existing = await _repository.GetTrack<RecurringItem>()
                .FirstOrDefaultAsync(r => r.RecurringItemId == recurringItemId && r.UserId == userId);

            if (existing == null)
            {
                return null;
            }

            var draft = await BuildValidatedEntityAsync(userId, input, existing);

            existing.Name = draft.Name;
            existing.AmountMode = draft.AmountMode;
            existing.AmountMxn = draft.AmountMxn;
            existing.DayOfMonth = draft.DayOfMonth;
            existing.CategoryId = draft.CategoryId;
            existing.SubcategoryId = draft.SubcategoryId;
            existing.AccountId = draft.AccountId;
            existing.MerchantId = draft.MerchantId;
            existing.StartsPeriod = draft.StartsPeriod;
            existing.EndsPeriod = draft.EndsPeriod;
            existing.AutoExecute = draft.AutoExecute;
            existing.EffectiveFrom = draft.EffectiveFrom;

            try
            {
                await _repository.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex, TemplateNameIndexName))
            {
                throw new ArgumentException(
                    "A recurring item with the same kind and name already exists.",
                    nameof(input));
            }

            return await GetAsync(recurringItemId, userId);
        }

        public async Task<RecurringItemDetail?> SetActiveAsync(int recurringItemId, int userId, bool active)
        {
            var template = await _repository.GetTrack<RecurringItem>()
                .FirstOrDefaultAsync(r => r.RecurringItemId == recurringItemId && r.UserId == userId);

            if (template == null)
            {
                return null;
            }

            // Desactivar detiene el motor en el ciclo siguiente: el flag se consulta al ejecutar,
            // nunca al materializar (sección 14, pendiente 10).
            template.Active = active;
            await _repository.SaveChangesAsync();

            return await GetAsync(recurringItemId, userId);
        }

        public RecurringItemConfigResult GetConfig()
        {
            return new RecurringItemConfigResult
            {
                AutoExecuteAvailable = _settings.TelegramAlertingAvailable,
                Reason = _settings.TelegramAlertingAvailable
                    ? null
                    : "Habilita Telegram (Telegram:Enabled con BotToken y AllowedUserId configurados) para activar la ejecución automática."
            };
        }

        public async Task<RecurringItemFromTransactionResult> CreateFromTransactionAsync(
            int userId,
            int transactionId,
            bool dryRun)
        {
            var transaction = await _repository
                .Get<Transaction>(t => t.TransactionId == transactionId && t.Account.UserId == userId)
                .Select(t => new
                {
                    t.TransactionId,
                    t.Type,
                    t.Amount,
                    t.TransactionDate,
                    t.Description,
                    t.CategoryId,
                    t.SubcategoryId,
                    t.AccountId,
                    t.MerchantId,
                    t.TransferGroupId
                })
                .FirstOrDefaultAsync();

            // Ajeno o inexistente: el mismo 404. Nunca 403 con datos (criterios 19 y 39).
            if (transaction == null)
            {
                return new RecurringItemFromTransactionResult { DryRun = dryRun, Written = false };
            }

            if (transaction.TransferGroupId != null ||
                transaction.Type == TransactionDomainConstants.TransactionType.Transfer ||
                transaction.Type == TransactionDomainConstants.TransactionType.OpeningCredit)
            {
                throw new ArgumentException("Only income and expense transactions can be scheduled.");
            }

            if (transaction.Type != TransactionDomainConstants.TransactionType.Income &&
                transaction.Type != TransactionDomainConstants.TransactionType.Expense)
            {
                throw new ArgumentException("Only income and expense transactions can be scheduled.");
            }

            var kind = transaction.Type;

            // El día se deriva del día LOCAL de la transacción, no del UTC almacenado.
            var localDate = MonthRangeResolver.ResolveLocalDate(transaction.TransactionDate);
            var name = NormalizeName(transaction.Description);

            // La repetición mira hacia adelante: la transacción ya ocurrió (sección 5).
            var startsPeriod = MonthRangeResolver.NextPeriodKey(MonthRangeResolver.ToPeriodKey(localDate));

            var existing = await _repository.GetTrack<RecurringItem>()
                .FirstOrDefaultAsync(r => r.UserId == userId && r.Kind == kind && r.Name == name);

            var proposal = new RecurringItemDetail
            {
                Kind = kind,
                Name = name,
                AmountMode = RecurringItemAmountMode.Fixed,
                AmountMxn = RoundMoney(transaction.Amount),
                DayOfMonth = localDate.Day,
                CategoryId = transaction.CategoryId,
                SubcategoryId = transaction.SubcategoryId,
                AccountId = transaction.AccountId,
                MerchantId = transaction.MerchantId,
                StartsPeriod = startsPeriod,
                EndsPeriod = null,
                Active = true,
                AutoExecute = false,
                // effective_from es decisión manual del usuario (sección 4.7): el dryRun no la inventa.
                EffectiveFrom = null
            };

            if (dryRun)
            {
                // dryRun siempre responde 200 con la propuesta. El 409 es del guardado real: la UI
                // necesita ver la propuesta y, de paso, saber que la clave ya está ocupada para
                // ofrecer "ya existe, ¿editar?" en vez de dejar que el usuario choque con el error.
                return new RecurringItemFromTransactionResult
                {
                    DryRun = true,
                    Written = false,
                    Conflict = false,
                    Template = proposal,
                    Existing = existing == null ? null : await GetAsync(existing.RecurringItemId, userId)
                };
            }

            if (existing != null)
            {
                // La clave única (user, kind, name) no incluye `active`: una plantilla desactivada
                // sigue ocupando el nombre y un alta nueva fallaría con violación de índice.
                return new RecurringItemFromTransactionResult
                {
                    DryRun = false,
                    Written = false,
                    Conflict = true,
                    Existing = await GetAsync(existing.RecurringItemId, userId)
                };
            }

            var writeInput = new RecurringItemWriteInput
            {
                Kind = proposal.Kind,
                Name = proposal.Name,
                AmountMode = proposal.AmountMode,
                AmountMxn = proposal.AmountMxn,
                DayOfMonth = proposal.DayOfMonth,
                CategoryId = proposal.CategoryId,
                SubcategoryId = proposal.SubcategoryId,
                AccountId = proposal.AccountId,
                MerchantId = proposal.MerchantId,
                StartsPeriod = proposal.StartsPeriod,
                AutoExecute = false,
                EffectiveFrom = null
            };

            var created = await CreateAsync(userId, writeInput);

            return new RecurringItemFromTransactionResult
            {
                DryRun = false,
                Written = true,
                Template = created
            };
        }

        public async Task<RecurringExecutionResult> ExecuteDueAsync(
            int userId,
            DateTime? nowUtc = null,
            CancellationToken cancellationToken = default)
        {
            var utcNow = nowUtc ?? DateTime.UtcNow;
            var today = MonthRangeResolver.ResolveLocalDate(utcNow);
            var periodKey = MonthRangeResolver.ToPeriodKey(today);

            // El periodo se materializa ANTES de ejecutar: sin partida no hay guardia de idempotencia
            // y el motor podría crear la transacción dos veces.
            var materialization = await MaterializeInternalAsync(userId, periodKey, persist: true, cancellationToken);

            var result = new RecurringExecutionResult
            {
                PeriodKey = periodKey,
                Materialized = materialization.Inserted
            };

            if (!_settings.TelegramAlertingAvailable)
            {
                // Degradación a lo seguro (sección 7.4): sin salida de Telegram no se mueve dinero;
                // las partidas quedan pending y las alertas de partida (Fase 3.4) las cubren.
                result.ExecutionSkipped = true;
                return result;
            }

            var templates = await _repository.Get<RecurringItem>(r =>
                    r.UserId == userId &&
                    r.Active &&
                    r.AutoExecute &&
                    r.Kind == TransactionDomainConstants.TransactionType.Expense &&
                    r.AccountId != null)
                .ToListAsync(cancellationToken);

            if (templates.Count == 0)
            {
                return result;
            }

            // Lectura RASTREADA: la partida es la guardia de idempotencia y se muta al enlazar.
            var items = await _repository.GetTrack<BudgetItem>()
                .Where(i => i.UserId == userId && i.PeriodKey == periodKey && i.RecurringItemId != null)
                .ToListAsync(cancellationToken);

            var itemByTemplate = items
                .GroupBy(i => i.RecurringItemId!.Value)
                .ToDictionary(g => g.Key, g => g.OrderBy(i => i.ItemId).First());

            foreach (var template in templates)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (!itemByTemplate.TryGetValue(template.RecurringItemId, out var item))
                {
                    continue;
                }

                // Guardia: una sola transacción por (recurring_item_id, period_key). Reiniciar el
                // servicio no duplica gastos; borrar la transacción devuelve la partida a pending y
                // el siguiente ciclo la vuelve a crear mientras la plantilla siga activa.
                if (item.Status != BudgetItemStatus.Pending)
                {
                    continue;
                }

                if (item.PlannedDate.Date > today)
                {
                    continue;
                }

                try
                {
                    var executedAmount = await ExecuteTemplateAsync(template, item, cancellationToken);
                    result.Executed++;

                    // Post-commit a propósito: el aviso se encola con la transacción ya confirmada.
                    // Si el envío falla, el gasto es un hecho y el drenador reintenta. El índice único
                    // del outbox (source_type, source_id, source_key) garantiza un aviso por plantilla
                    // y periodo aunque el ciclo se repita.
                    // El aviso lleva el monto REALMENTE ejecutado, no el planificado: si divergen, el
                    // mensaje debe coincidir con lo que se movió en la cuenta.
                    var queued = await _repository.ClaimRecurringItemNoticeAsync(
                        template.RecurringItemId,
                        userId,
                        periodKey,
                        BuildExecutionNotice(template.Name, executedAmount, item.PlannedDate),
                        DateTimeOffset.UtcNow);

                    if (queued)
                    {
                        result.NoticesQueued++;
                    }
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    // Solo el tipo: nunca montos, payload ni mensaje de excepción.
                    // La partida queda pending y las alertas de partida la cubren (sección 6.3).
                }
            }

            return result;
        }

        public Task<RecurringMaterializationResult> MaterializeAsync(
            int userId,
            string periodKey,
            CancellationToken cancellationToken = default)
        {
            var period = NormalizePeriodKey(periodKey);
            return MaterializeInternalAsync(userId, period, persist: true, cancellationToken);
        }

        public async Task<BudgetRolloverResult> RolloverAsync(int userId, BudgetRolloverInput input)
        {
            if (input == null) throw new ArgumentException("Rollover input is required.", nameof(input));

            var fromPeriod = NormalizePeriodKey(input.FromPeriod);
            var toPeriod = NormalizePeriodKey(input.ToPeriod);

            if (string.CompareOrdinal(toPeriod, fromPeriod) <= 0)
            {
                throw new ArgumentException("toPeriod must be later than fromPeriod.");
            }

            var mode = NormalizeRolloverMode(input.Mode);
            var dryRun = input.DryRun;

            // El rollover real va en una sola transacción SQL: un dryRun nunca escribe, y un error a
            // mitad de la clonación no deja el mes destino con presupuestos sin partidas.
            if (!dryRun)
            {
                return await _repository.ExecuteInTransactionAsync(() =>
                    ExecuteRolloverAsync(userId, fromPeriod, toPeriod, mode, dryRun: false));
            }

            return await ExecuteRolloverAsync(userId, fromPeriod, toPeriod, mode, dryRun: true);
        }

        private async Task<BudgetRolloverResult> ExecuteRolloverAsync(
            int userId,
            string fromPeriod,
            string toPeriod,
            string mode,
            bool dryRun)
        {
            var result = new BudgetRolloverResult
            {
                FromPeriod = fromPeriod,
                ToPeriod = toPeriod,
                Mode = mode,
                DryRun = dryRun
            };

            var manualKeys = new HashSet<string>(StringComparer.Ordinal);

            // Los presupuestos se clonan en los tres modos: el modo gobierna solo las partidas.
            await CloneBudgetsAsync(userId, fromPeriod, toPeriod, result.Budgets, dryRun);

            if (mode != BudgetRolloverMode.Remount)
            {
                await CopyManualItemsAsync(userId, fromPeriod, toPeriod, result.ManualItems, dryRun, manualKeys);
            }

            if (mode != BudgetRolloverMode.Copy)
            {
                // El remonte respeta las claves que el copiado manual ya reservó (o ya escribió): así
                // un modo combinado no promete ni intenta dos veces la misma ocurrencia.
                var remounted = await MaterializeInternalAsync(
                    userId,
                    toPeriod,
                    persist: !dryRun,
                    CancellationToken.None,
                    reservedKeys: manualKeys);

                result.RemountedItems = new BudgetRolloverCounts
                {
                    Attempted = remounted.Attempted,
                    Inserted = remounted.Inserted,
                    Skipped = remounted.Skipped,
                    Omitted = remounted.Omitted
                };
            }

            return result;
        }

        #region Materialization

        private async Task<RecurringMaterializationResult> MaterializeInternalAsync(
            int userId,
            string periodKey,
            bool persist,
            CancellationToken cancellationToken,
            ICollection<string>? reservedKeys = null)
        {
            var result = new RecurringMaterializationResult { PeriodKey = periodKey };

            // El catálogo es pequeño por usuario: se lee completo y la ventana de vigencia se resuelve
            // en memoria para no depender de comparaciones de texto en SQL sobre columnas char(7).
            var templates = await _repository.Get<RecurringItem>(r => r.UserId == userId && r.Active)
                .ToListAsync(cancellationToken);

            var inWindow = templates
                .Where(r => IsInWindow(r, periodKey))
                .OrderBy(r => r.RecurringItemId)
                .ToList();

            if (inWindow.Count == 0)
            {
                return result;
            }

            var existingKeys = (await _repository.Get<BudgetItem>(i =>
                    i.UserId == userId && i.PeriodKey == periodKey)
                .Select(i => new { i.Kind, i.Name })
                .ToListAsync(cancellationToken))
                .Select(i => OccurrenceKey(i.Kind, i.Name))
                .ToHashSet(StringComparer.Ordinal);

            // El rollover en dryRun copia partidas manuales que todavía no están en la base: sin
            // sembrar sus claves, el remonte las contaría como insertables y el dryRun prometería más
            // de lo que el rollover real escribiría.
            if (reservedKeys != null)
            {
                foreach (var key in reservedKeys)
                {
                    existingKeys.Add(key);
                }
            }

            // Los promedios se derivan una sola vez para todas las plantillas del periodo.
            Dictionary<int, decimal>? averages = null;

            foreach (var template in inWindow)
            {
                cancellationToken.ThrowIfCancellationRequested();
                result.Attempted++;

                decimal amount;
                if (template.AmountMode == RecurringItemAmountMode.Average)
                {
                    averages ??= await ResolveAverageAmountsAsync(userId, inWindow, periodKey, cancellationToken);
                    if (!averages.TryGetValue(template.RecurringItemId, out amount) || amount <= 0m)
                    {
                        // Sin historial ejecutado no hay cuota que proyectar: no se inventa un monto
                        // (planned_amount > 0 lo prohíbe) y se reporta como omisión explícita.
                        result.Omitted++;
                        continue;
                    }
                }
                else
                {
                    if (template.AmountMxn is not { } declared || declared <= 0m)
                    {
                        result.Omitted++;
                        continue;
                    }

                    amount = RoundMoney(declared);
                }

                var key = OccurrenceKey(template.Kind, template.Name);
                var plannedDate = ResolvePlannedDate(template, periodKey);

                if (existingKeys.Contains(key))
                {
                    result.Skipped++;
                    continue;
                }

                if (!persist)
                {
                    result.Inserted++;
                    existingKeys.Add(key);
                    continue;
                }

                var claim = new BudgetItemClaim
                {
                    UserId = userId,
                    PeriodKey = periodKey,
                    Kind = template.Kind,
                    Name = template.Name,
                    PlannedAmount = amount,
                    PlannedDate = plannedDate,
                    CategoryId = template.CategoryId,
                    SubcategoryId = template.SubcategoryId,
                    AccountId = template.AccountId,
                    MerchantId = template.MerchantId,
                    RecurringItemId = template.RecurringItemId,
                    // Una cuota derivada de promedio no compromete dinero (sección 3.1).
                    IsProjected = template.AmountMode == RecurringItemAmountMode.Average,
                    Source = BudgetItemSource.Template
                };

                // ON CONFLICT DO NOTHING: una sola sentencia decide sin lectura previa. Si otro
                // proceso materializó la misma ocurrencia, esta llamada no inserta y no falla.
                if (await _repository.ClaimBudgetItemAsync(claim))
                {
                    result.Inserted++;
                    existingKeys.Add(key);
                }
                else
                {
                    result.Skipped++;
                }
            }

            return result;
        }

        /// <summary>
        /// Monto promedio de las plantillas <c>average</c>: promedio de los <b>últimos N meses con
        /// movimiento ejecutado</b> en el scope de la plantilla, contando hacia atrás desde el mes
        /// anterior al periodo (sección 4.5). Nulo cuando no hay historial, para que el materializador
        /// omita la ocurrencia en vez de inventar un monto.
        /// </summary>
        private async Task<Dictionary<int, decimal>> ResolveAverageAmountsAsync(
            int userId,
            IReadOnlyList<RecurringItem> templates,
            string periodKey,
            CancellationToken cancellationToken)
        {
            var months = Math.Max(1, _settings.AverageMonths);
            var averageTemplates = templates
                .Where(t => t.AmountMode == RecurringItemAmountMode.Average)
                .ToList();

            var result = new Dictionary<int, decimal>();
            if (averageTemplates.Count == 0)
            {
                return result;
            }

            // El historial son meses ya cerrados: se mira hacia atrás desde el mes anterior al que se
            // materializa, con un tope de exploración para que una racha sin movimientos no recorra
            // el historial completo.
            var scannedPeriods = new List<string>(months * AverageLookbackFactor);
            var cursor = periodKey;
            for (var i = 0; i < months * AverageLookbackFactor; i++)
            {
                cursor = MonthRangeResolver.PreviousPeriodKey(cursor);
                scannedPeriods.Add(cursor);
            }

            var oldest = scannedPeriods[^1];
            var (_, _, windowStartUtc, _) = MonthRangeResolver.ResolveUtcRange(oldest, null);
            var (_, _, _, windowEndUtc) = MonthRangeResolver.ResolveUtcRange(periodKey, null);

            foreach (var template in averageTemplates)
            {
                var kind = template.Kind;
                var query = _repository.Get<Transaction>(t =>
                    t.Account.UserId == userId &&
                    t.TransferGroupId == null &&
                    t.Type == kind &&
                    t.TransactionDate >= windowStartUtc &&
                    t.TransactionDate < windowEndUtc);

                query = template.SubcategoryId.HasValue
                    ? query.Where(t => t.SubcategoryId == template.SubcategoryId)
                    : query.Where(t => t.CategoryId == template.CategoryId);

                var transactions = await query
                    .Select(t => new { t.TransactionDate, t.Amount })
                    .ToListAsync(cancellationToken);

                if (transactions.Count == 0)
                {
                    continue;
                }

                // El periodo se resuelve en memoria: es local (America/Mexico_City) y truncarlo en SQL
                // correría el día y, con él, el mes.
                var byPeriod = transactions
                    .GroupBy(t => MonthRangeResolver.ToPeriodKey(
                        MonthRangeResolver.ResolveLocalDate(t.TransactionDate)))
                    .ToDictionary(g => g.Key, g => RoundMoney(g.Sum(t => t.Amount)));

                // Solo meses con movimiento real; el más reciente primero, hasta N.
                var executionMonths = scannedPeriods
                    .Where(byPeriod.ContainsKey)
                    .Take(months)
                    .ToList();

                if (executionMonths.Count == 0)
                {
                    continue;
                }

                var average = RoundMoney(executionMonths.Sum(p => byPeriod[p]) / executionMonths.Count);
                if (average > 0m)
                {
                    result[template.RecurringItemId] = average;
                }
            }

            return result;
        }

        /// <summary>
        /// Vigencia efectiva: el primer periodo es el mes de <c>effective_from</c> cuando existe
        /// (la validación garantiza que no sea anterior a <c>starts_period</c>), y el último lo fija
        /// <c>ends_period</c>. Comparación lexicográfica: <c>yyyy-MM</c> está rellenado con ceros.
        /// </summary>
        private static bool IsInWindow(RecurringItem template, string periodKey)
        {
            var firstPeriod = ResolveFirstPeriod(template);

            if (string.CompareOrdinal(periodKey, firstPeriod) < 0)
            {
                return false;
            }

            var endsPeriod = NormalizePeriodOrNull(template.EndsPeriod);
            return endsPeriod == null || string.CompareOrdinal(periodKey, endsPeriod) <= 0;
        }

        private static string ResolveFirstPeriod(RecurringItem template)
        {
            if (template.EffectiveFrom.HasValue)
            {
                var effectivePeriod = MonthRangeResolver.ToPeriodKey(template.EffectiveFrom.Value);
                if (string.CompareOrdinal(effectivePeriod, NormalizePeriod(template.StartsPeriod)) > 0)
                {
                    return effectivePeriod;
                }
            }

            return NormalizePeriod(template.StartsPeriod);
        }

        /// <summary>
        /// Fecha de la ocurrencia. <c>effective_from</c> manda <b>solo</b> en el primer periodo que
        /// gobierna (sección 4.7); los meses siguientes vuelven a <c>day_of_month</c>, con el ajuste
        /// de último-día-del-mes centralizado en <c>MonthRangeResolver</c>.
        /// </summary>
        private static DateOnly ResolvePlannedDate(RecurringItem template, string periodKey)
        {
            if (template.EffectiveFrom.HasValue &&
                string.Equals(periodKey, ResolveFirstPeriod(template), StringComparison.Ordinal) &&
                string.Equals(
                    MonthRangeResolver.ToPeriodKey(template.EffectiveFrom.Value),
                    periodKey,
                    StringComparison.Ordinal))
            {
                // effective_from es una fecha local sin zona: DateOnly.FromDateTime la proyecta tal cual.
                return DateOnly.FromDateTime(template.EffectiveFrom.Value);
            }

            return MonthRangeResolver.ResolveDayOfMonthInPeriod(periodKey, template.DayOfMonth);
        }

        /// <summary>Clave de ocurrencia equivalente al índice <c>uq_budget_items_user_period_kind_name</c>.</summary>
        private static string OccurrenceKey(string kind, string name) =>
            string.Concat(kind, "\u0000", name);

        #endregion

        #region Rollover

        private async Task CloneBudgetsAsync(
            int userId,
            string fromPeriod,
            string toPeriod,
            BudgetRolloverCounts counts,
            bool dryRun)
        {
            var budgets = await _repository
                .Get<Budget>(b => b.UserId == userId && b.PeriodKey == fromPeriod)
                .Include(b => b.Thresholds)
                .OrderBy(b => b.BudgetId)
                .ToListAsync();

            if (budgets.Count == 0)
            {
                return;
            }

            // Una sola lectura del mes destino: el mapa (categoría, subcategoría) sustituye la consulta
            // de existencia por presupuesto. La clave usa 0 como centinela porque SQL no compara NULL
            // con NULL y el índice de expresión del scope hace exactamente lo mismo.
            var takenScopes = (await _repository.Get<Budget>(b =>
                    b.UserId == userId && b.PeriodKey == toPeriod)
                .Select(b => new { b.CategoryId, b.SubcategoryId })
                .ToListAsync())
                .Select(b => ScopeKey(b.CategoryId, b.SubcategoryId))
                .ToHashSet();

            foreach (var budget in budgets)
            {
                counts.Attempted++;

                var scopeKey = ScopeKey(budget.CategoryId, budget.SubcategoryId);

                // El mes destino nunca se sobrescribe: una colisión de scope se salta, no se actualiza.
                if (takenScopes.Contains(scopeKey))
                {
                    counts.Skipped++;
                    continue;
                }

                if (dryRun)
                {
                    counts.Inserted++;
                    takenScopes.Add(scopeKey);
                    continue;
                }

                try
                {
                    var clone = new Budget
                    {
                        UserId = userId,
                        PeriodKey = toPeriod,
                        Name = budget.Name,
                        CategoryId = budget.CategoryId,
                        SubcategoryId = budget.SubcategoryId,
                        AmountMxn = budget.AmountMxn,
                        Active = budget.Active
                    };

                    // Un Save por presupuesto: los umbrales necesitan el id generado. El caller ya
                    // envolvió todo el rollover real en una transacción SQL, así que no hay commit parcial.
                    await _repository.Save(clone);

                    foreach (var threshold in budget.Thresholds)
                    {
                        await _repository.Save(new BudgetThreshold
                        {
                            BudgetId = clone.BudgetId,
                            Name = threshold.Name,
                            Percent = threshold.Percent,
                            Active = threshold.Active
                        });
                    }

                    counts.Inserted++;
                    takenScopes.Add(scopeKey);
                }
                catch (DbUpdateException ex) when (IsUniqueViolation(ex, BudgetScopeIndexName))
                {
                    // Carrera entre dos rollovers del mismo mes: el índice de expresión ganó.
                    counts.Skipped++;
                }
            }
        }

        private async Task CopyManualItemsAsync(
            int userId,
            string fromPeriod,
            string toPeriod,
            BudgetRolloverCounts counts,
            bool dryRun,
            ICollection<string> reservedKeys)
        {
            // Las partidas cancelled no se copian: su monto ya se liberó. Las ejecutadas sí, porque el
            // rollover copia el plan, no la ejecución del mes anterior.
            var items = await _repository.Get<BudgetItem>(i =>
                    i.UserId == userId &&
                    i.PeriodKey == fromPeriod &&
                    i.Source == BudgetItemSource.Manual &&
                    i.Status != BudgetItemStatus.Cancelled)
                .OrderBy(i => i.ItemId)
                .ToListAsync();

            if (items.Count == 0)
            {
                return;
            }

            // Mismo criterio que en los presupuestos: una sola lectura del mes destino decide por
            // (kind, nombre), que es la clave real del índice uq_budget_items_user_period_kind_name.
            var takenKeys = (await _repository.Get<BudgetItem>(i =>
                    i.UserId == userId && i.PeriodKey == toPeriod)
                .Select(i => new { i.Kind, i.Name })
                .ToListAsync())
                .Select(i => OccurrenceKey(i.Kind, i.Name))
                .ToHashSet(StringComparer.Ordinal);

            foreach (var item in items)
            {
                counts.Attempted++;

                var key = OccurrenceKey(item.Kind, item.Name);
                if (takenKeys.Contains(key))
                {
                    counts.Skipped++;
                    continue;
                }

                if (dryRun)
                {
                    counts.Inserted++;
                    takenKeys.Add(key);
                    reservedKeys.Add(key);
                    continue;
                }

                var claim = new BudgetItemClaim
                {
                    UserId = userId,
                    PeriodKey = toPeriod,
                    Kind = item.Kind,
                    Name = item.Name,
                    PlannedAmount = item.PlannedAmount,
                    // El día se conserva; el mes lo fija el destino, con el ajuste de fin de mes.
                    PlannedDate = MonthRangeResolver.ResolveDayOfMonthInPeriod(toPeriod, item.PlannedDate.Day),
                    CategoryId = item.CategoryId,
                    SubcategoryId = item.SubcategoryId,
                    AccountId = item.AccountId,
                    MerchantId = item.MerchantId,
                    RecurringItemId = null,
                    IsProjected = false,
                    Source = BudgetItemSource.Manual
                };

                if (await _repository.ClaimBudgetItemAsync(claim))
                {
                    counts.Inserted++;
                    takenKeys.Add(key);
                    reservedKeys.Add(key);
                }
                else
                {
                    counts.Skipped++;
                }
            }
        }

        /// <summary>
        /// Clave de scope equivalente al índice <c>ux_budgets_user_period_scope</c>, que indexa
        /// <c>COALESCE(category_id, 0), COALESCE(subcategory_id, 0)</c>. 0 es inalcanzable como id real.
        /// </summary>
        private static string ScopeKey(int? categoryId, int? subcategoryId) =>
            string.Concat(categoryId ?? 0, ":", subcategoryId ?? 0);

        private static string NormalizeRolloverMode(string? mode)
        {
            if (string.IsNullOrWhiteSpace(mode))
            {
                return BudgetRolloverMode.CopyAndRemount;
            }

            var normalized = mode.Trim().ToLowerInvariant();
            if (!BudgetRolloverMode.IsValid(normalized))
            {
                throw new ArgumentException("mode must be one of: copy, remount, copy-and-remount.", nameof(mode));
            }

            return normalized;
        }

        #endregion

        #region Execution

        /// <summary>
        /// Crea la transacción del gasto programado y enlaza la partida en la <b>misma</b> transacción
        /// SQL: nunca hay una partida marcada ejecutada sin su gasto, ni un gasto huérfano. Devuelve el
        /// monto realmente creado.
        /// </summary>
        /// <remarks>
        /// La guardia de idempotencia es la partida en <c>status='executed'</c> y se decide antes de
        /// llamar aquí; el índice único parcial <c>uq_budget_items_transaction</c> es la segunda barrera.
        /// La fecha sale de <c>planned_date</c>, que ya resolvió <c>day_of_month</c> y <c>effective_from</c>
        /// al materializar: recalcularla aquí sería una segunda fuente de verdad.
        /// </remarks>
        private async Task<decimal> ExecuteTemplateAsync(
            RecurringItem template,
            BudgetItem item,
            CancellationToken cancellationToken)
        {
            var accountId = template.AccountId!.Value;
            var amount = RoundMoney(template.AmountMxn ?? item.PlannedAmount);

            return await _repository.ExecuteInTransactionAsync(async () =>
            {
                var transaction = new Transaction
                {
                    AccountId = accountId,
                    CategoryId = template.CategoryId,
                    SubcategoryId = template.SubcategoryId,
                    MerchantId = template.MerchantId,
                    Amount = amount,
                    Description = template.Name,
                    // Fecha local → UTC con la zona del resolver: el día no se corre.
                    TransactionDate = MonthRangeResolver.ToUtc(item.PlannedDate),
                    Origin = TransactionOrigin.AutoRecurring,
                    OriginRecurringItemId = template.RecurringItemId
                };

                // Se reutiliza el camino de creación de gasto: bloquea la cuenta, valida dimensiones
                // y rechaza saldo insuficiente. Un INSERT a mano saltaría esas garantías. La transacción
                // SQL es compartida (ExecuteInTransactionAsync es reentrante), así que el enlace de la
                // partida y el gasto se confirman o se revierten juntos.
                var created = await _transactionCommandService.CreateExpenseAsync(transaction, template.UserId);

                item.Status = BudgetItemStatus.Executed;
                item.TransactionId = created.TransactionId;
                await _repository.SaveChangesAsync();

                return created.Amount;
            });
        }

        /// <summary>
        /// Texto del aviso de ejecución automática. Se congela al encolar y no se registra en logs:
        /// es dato financiero. El destino es siempre el único configurado (sección 7.3).
        /// </summary>
        private static string BuildExecutionNotice(string name, decimal amount, DateTime localDate) =>
            string.Create(CultureInfo.InvariantCulture, $"""
                Gasto programado ejecutado automáticamente
                {name}
                Monto: ${amount:N2}
                Fecha: {localDate:yyyy-MM-dd}
                """);

        #endregion

        #region Validation

        /// <summary>
        /// Construye la entidad validada. <paramref name="existing"/> nulo en alta: <c>kind</c> es
        /// inmutable y el periodo de inicio no puede retroceder a un mes ya reportado.
        /// </summary>
        private async Task<RecurringItem> BuildValidatedEntityAsync(
            int userId,
            RecurringItemWriteInput input,
            RecurringItem? existing)
        {
            var kind = NormalizeKind(input.Kind);
            if (existing != null && !string.Equals(kind, existing.Kind, StringComparison.Ordinal))
            {
                throw new ArgumentException("kind cannot be changed.");
            }

            var name = NormalizeName(input.Name);
            var amountMode = NormalizeAmountMode(input.AmountMode);
            var dayOfMonth = NormalizeDayOfMonth(input.DayOfMonth);
            var (categoryId, subcategoryId) = await ValidateScopeAsync(userId, kind, input.CategoryId, input.SubcategoryId);
            await ValidateOwnershipAsync(userId, input.AccountId, input.MerchantId);

            var currentPeriod = MonthRangeResolver.CurrentPeriodKey();
            // Fecha local, sin zona: se compara contra effective_from con ToDateTime() abajo porque la
            // igualdad de DateOnly no aplica al chequeo de "cambió" (que compara contra la entidad).
            var currentMonthStart = MonthRangeResolver.ResolveDayOfMonthInPeriod(currentPeriod, 1);

            var startsPeriod = NormalizePeriodKey(
                string.IsNullOrWhiteSpace(input.StartsPeriod) && existing != null
                    ? existing.StartsPeriod
                    : input.StartsPeriod);

            // La frontera del mes en curso se aplica al VALOR NUEVO, no al que ya estaba guardado:
            // si se validara siempre, editar una plantilla creada en julio fallaría en septiembre al
            // reenviar su propio starts_period. Solo se rechaza retroceder el inicio.
            var startsPeriodChanged = existing == null ||
                !string.Equals(startsPeriod, NormalizePeriod(existing.StartsPeriod), StringComparison.Ordinal);

            if (startsPeriodChanged && string.CompareOrdinal(startsPeriod, currentPeriod) < 0)
            {
                throw new ArgumentException("startsPeriod cannot be earlier than the current month.");
            }

            string? endsPeriod = null;
            if (!string.IsNullOrWhiteSpace(input.EndsPeriod))
            {
                endsPeriod = NormalizePeriodKey(input.EndsPeriod);
                if (string.CompareOrdinal(endsPeriod, startsPeriod) < 0)
                {
                    throw new ArgumentException("endsPeriod cannot be earlier than startsPeriod.");
                }
            }

            decimal? amountMxn = null;
            if (amountMode == RecurringItemAmountMode.Fixed)
            {
                amountMxn = NormalizeAmount(input.AmountMxn);
            }

            DateTime? effectiveFrom = null;
            if (input.EffectiveFrom.HasValue)
            {
                effectiveFrom = DateTime.SpecifyKind(input.EffectiveFrom.Value.Date, DateTimeKind.Unspecified);

                // Misma razón que en startsPeriod: la frontera se evalúa contra el valor nuevo. Reenviar
                // una effective_from histórica al editar no puede ser un 400.
                var effectiveFromChanged = existing?.EffectiveFrom?.Date != effectiveFrom.Value;
                if (effectiveFromChanged && effectiveFrom.Value < currentMonthStart.ToDateTime(TimeOnly.MinValue))
                {
                    // Frontera dura: nunca antes del primer día del mes en curso. Sin backfill de meses
                    // ya reportados, así que el caso "mes cerrado" es imposible por construcción.
                    throw new ArgumentException("effectiveFrom cannot be earlier than the first day of the current month.");
                }

                if (string.CompareOrdinal(MonthRangeResolver.ToPeriodKey(effectiveFrom.Value), startsPeriod) < 0)
                {
                    throw new ArgumentException("effectiveFrom cannot be earlier than startsPeriod.");
                }
            }

            var autoExecute = input.AutoExecute;
            if (autoExecute)
            {
                // Reglas de sección 4.6: solo gasto con cuenta, solo con monto declarado y solo si
                // existe salida de Telegram para poder avisar (secciones 4.6 regla 3-bis y 7.4).
                if (kind != TransactionDomainConstants.TransactionType.Expense)
                {
                    throw new ArgumentException("autoExecute is only available for expense recurring items.");
                }

                if (!input.AccountId.HasValue)
                {
                    throw new ArgumentException("autoExecute requires an accountId.");
                }

                if (amountMode != RecurringItemAmountMode.Fixed)
                {
                    throw new ArgumentException("autoExecute requires a fixed amount.");
                }

                if (!_settings.TelegramAlertingAvailable)
                {
                    throw new ArgumentException(
                        "Habilita Telegram para activar la ejecución automática: una programada que mueve dinero no puede quedar sin aviso.");
                }
            }

            return new RecurringItem
            {
                UserId = userId,
                Kind = kind,
                Name = name,
                AmountMode = amountMode,
                AmountMxn = amountMxn,
                DayOfMonth = dayOfMonth,
                CategoryId = categoryId,
                SubcategoryId = subcategoryId,
                AccountId = input.AccountId,
                MerchantId = input.MerchantId,
                StartsPeriod = startsPeriod,
                EndsPeriod = endsPeriod,
                Active = existing?.Active ?? true,
                AutoExecute = autoExecute,
                EffectiveFrom = effectiveFrom
            };
        }

        /// <summary>
        /// Mismo patrón que <c>BudgetItemService.ValidateScopeAsync</c>: XOR estricto, propiedad
        /// (<c>UserId == userId || UserId == null</c>) y coherencia del <c>type</c> con el <c>kind</c>.
        /// Un ingreso no admite subcategoría.
        /// </summary>
        private async Task<(int? CategoryId, int? SubcategoryId)> ValidateScopeAsync(
            int userId,
            string kind,
            int? categoryId,
            int? subcategoryId)
        {
            if (categoryId.HasValue == subcategoryId.HasValue)
            {
                throw new ArgumentException("Recurring item scope must be exactly one of categoryId or subcategoryId.");
            }

            var expectedType = kind == TransactionDomainConstants.TransactionType.Income
                ? TransactionDomainConstants.TransactionType.Income
                : TransactionDomainConstants.TransactionType.Expense;

            if (categoryId.HasValue)
            {
                var category = await _repository.Get<Category>(c =>
                        c.CategoryId == categoryId.Value && (c.UserId == userId || c.UserId == null))
                    .FirstOrDefaultAsync();

                if (category == null)
                {
                    throw new ArgumentException("Category not found or not accessible.");
                }

                if (!string.Equals(category.Type, expectedType, StringComparison.OrdinalIgnoreCase))
                {
                    throw new ArgumentException($"Recurring item category must be of type {expectedType}.");
                }

                return (categoryId, null);
            }

            if (kind == TransactionDomainConstants.TransactionType.Income)
            {
                throw new ArgumentException("An income recurring item cannot use a subcategory.");
            }

            var subcategory = await _repository.Get<Subcategory>(s =>
                    s.SubcategoryId == subcategoryId!.Value && (s.UserId == userId || s.UserId == null))
                .FirstOrDefaultAsync();

            if (subcategory == null)
            {
                throw new ArgumentException("Subcategory not found or not accessible.");
            }

            var parent = await _repository.Get<Category>(c => c.CategoryId == subcategory.CategoryId)
                .FirstOrDefaultAsync();

            if (parent == null ||
                !string.Equals(parent.Type, TransactionDomainConstants.TransactionType.Expense, StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException("Recurring item subcategory must belong to an expense category.");
            }

            return (null, subcategoryId);
        }

        /// <summary>Cuenta propia y comercio propio o global. Ids ajenos → 400, nunca 403 con datos.</summary>
        private async Task ValidateOwnershipAsync(int userId, int? accountId, int? merchantId)
        {
            if (accountId.HasValue)
            {
                var exists = await _repository.Get<Account>(a =>
                        a.AccountId == accountId.Value && a.UserId == userId)
                    .AnyAsync();

                if (!exists)
                {
                    throw new ArgumentException("Account not found or not accessible.");
                }
            }

            if (merchantId.HasValue)
            {
                var exists = await _repository.Get<Merchant>(m =>
                        m.MerchantId == merchantId.Value && (m.UserId == userId || m.UserId == null))
                    .AnyAsync();

                if (!exists)
                {
                    throw new ArgumentException("Merchant not found or not accessible.");
                }
            }
        }

        private static string NormalizeKind(string? value)
        {
            var kind = value?.Trim().ToLowerInvariant();
            if (kind != TransactionDomainConstants.TransactionType.Income &&
                kind != TransactionDomainConstants.TransactionType.Expense)
            {
                throw new ArgumentException("kind must be one of: income, expense.", nameof(value));
            }

            return kind;
        }

        private static string? NormalizeKindOrNull(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            return NormalizeKind(value);
        }

        private static string NormalizeAmountMode(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return RecurringItemAmountMode.Fixed;
            }

            var mode = value.Trim().ToLowerInvariant();
            if (mode != RecurringItemAmountMode.Fixed && mode != RecurringItemAmountMode.Average)
            {
                throw new ArgumentException("amountMode must be one of: fixed, average.", nameof(value));
            }

            return mode;
        }

        private static int NormalizeDayOfMonth(int dayOfMonth)
        {
            if (dayOfMonth < 1 || dayOfMonth > 31)
            {
                throw new ArgumentException("dayOfMonth must be between 1 and 31.");
            }

            return dayOfMonth;
        }

        private static decimal NormalizeAmount(decimal? amount)
        {
            if (amount is not { } value)
            {
                throw new ArgumentException("amountMxn is required when amountMode is fixed.");
            }

            var rounded = RoundMoney(value);
            if (rounded <= 0m)
            {
                throw new ArgumentException("amountMxn must be greater than zero.");
            }

            return rounded;
        }

        private static string NormalizeName(string? value)
        {
            var name = value?.Trim() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(name))
            {
                name = DerivedNameFallback;
            }

            if (name.Length > MaxNameLength)
            {
                // El nombre derivado de una transacción no puede exceder la columna: se recorta en vez
                // de fallar, porque el exceso viene de datos existentes y no de una decisión del usuario.
                name = name[..MaxNameLength].TrimEnd();
            }

            return name;
        }

        private static string NormalizePeriodKey(string? periodKey)
        {
            if (string.IsNullOrWhiteSpace(periodKey) ||
                !DateTime.TryParseExact(periodKey.Trim(), "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            {
                throw new ArgumentException("period must use yyyy-MM format.", nameof(periodKey));
            }

            return periodKey.Trim();
        }

        private static string NormalizePeriod(string value) => value.Trim();

        private static string? NormalizePeriodOrNull(string? value) =>
            string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        /// <summary>
        /// Carrera entre dos altas concurrentes: el índice único rechazó la escritura. Se traduce a
        /// error de dominio (400) en vez de 500.
        /// </summary>
        private static bool IsUniqueViolation(DbUpdateException ex, string constraintName)
        {
            return ex.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: var name
            } && string.Equals(name, constraintName, StringComparison.Ordinal);
        }

        private static decimal RoundMoney(decimal value) =>
            Math.Round(value, 2, MidpointRounding.AwayFromZero);

        /// <summary>Proyección única de lectura del catálogo: un solo shape para lista y detalle.</summary>
        private static System.Linq.Expressions.Expression<Func<RecurringItem, RecurringItemDetail>> RecurringItemProjection =>
            r => new RecurringItemDetail
            {
                RecurringItemId = r.RecurringItemId,
                Kind = r.Kind,
                Name = r.Name,
                AmountMode = r.AmountMode,
                AmountMxn = r.AmountMxn,
                DayOfMonth = r.DayOfMonth,
                CategoryId = r.CategoryId,
                SubcategoryId = r.SubcategoryId,
                AccountId = r.AccountId,
                MerchantId = r.MerchantId,
                StartsPeriod = r.StartsPeriod,
                EndsPeriod = r.EndsPeriod,
                Active = r.Active,
                AutoExecute = r.AutoExecute,
                EffectiveFrom = r.EffectiveFrom,
                Created = r.Created,
                Updated = r.Updated
            };

        #endregion
    }
}
