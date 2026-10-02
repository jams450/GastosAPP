using GastosApp.BusinessLogic.Exceptions;
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
    /// Partidas planificadas de un periodo. El alcance siempre se acota por el <c>userId</c> recibido
    /// del token: nunca se confía en ids del payload. El <c>period_key</c> es derivado y no se acepta
    /// del cliente, de modo que el periodo y la fecha planificada no pueden divergir.
    /// </summary>
    public class BudgetItemService : IBudgetItemService
    {
        // Índice único uq_budget_items_user_period_kind_name. Vive solo en SQL, por eso se reconoce
        // por nombre en el error de Postgres para traducirlo a un 400 accionable.
        private const string NameUniqueIndexName = "uq_budget_items_user_period_kind_name";
        private const string NameConflictMessage =
            "A budget item with the same name already exists in this period and kind.";

        private const int MaxNameLength = 120;
        private const int MaxNotesLength = 300;

        // executed es terminal: la partida ya tiene una transaccion enlazada y ambas cosas se
        // sostienen mutuamente (ck_budget_items_executed). La unica reversa legitima es borrar la
        // transaccion, que el trigger trg_budget_items_release_on_transaction_delete devuelve a
        // pending. Soltar el enlace dejando la partida viva duplicaria el dinero: spent sale de
        // transactions y committed de las partidas pending/ignored, asi que effective = spent +
        // committed contaria el mismo monto dos veces y envenenaria los umbrales de alerta.
        private const string ExecutedIsTerminalMessage =
            "Una partida ejecutada no se puede deshacer desde aquí: elimina la transacción enlazada y volverá a pendiente.";

        private const string ExecutedPeriodIsTerminalMessage =
            "Una partida ejecutada no puede cambiar de mes: elimina la transacción enlazada si necesitas reubicarla.";

        private readonly IRepository _repository;
        private readonly IRecurringItemService _recurringItems;

        public BudgetItemService(IRepository repository, IRecurringItemService recurringItems)
        {
            _repository = repository;
            _recurringItems = recurringItems;
        }

        public async Task<IReadOnlyList<BudgetItemListItem>> ListAsync(int userId, BudgetItemQuery query)
        {
            var periodKey = ResolvePeriodKey(query.PeriodKey);
            var kind = NormalizeKindOrNull(query.Kind);
            var status = NormalizeStatusOrNull(query.Status);

            var items = _repository.Get<BudgetItem>(i =>
                    i.UserId == userId &&
                    i.PeriodKey == periodKey &&
                    (kind == null || i.Kind == kind) &&
                    (status == null || i.Status == status))
                .OrderBy(i => i.PlannedDate)
                .ThenBy(i => i.Name);

            return await ProjectListAsync(items).ToListAsync();
        }

        public async Task<BudgetItemListItem?> GetAsync(int itemId, int userId)
        {
            var items = _repository.Get<BudgetItem>(i => i.ItemId == itemId && i.UserId == userId);
            return await ProjectListAsync(items).FirstOrDefaultAsync();
        }

        public async Task<BudgetItemListItem> CreateAsync(int userId, BudgetItemWriteInput input)
        {
            if (input == null) throw new ArgumentException("Budget item input is required.", nameof(input));

            // Alta selectiva desde plantilla: 1 plantilla → 1 partida del periodo, ligada por FK y
            // marcada source=template. Opt-in por plantilla y mes; no hay auto-materialización aquí.
            if (input.RecurringItemId.HasValue)
            {
                return await CreateFromTemplateAsync(userId, input);
            }

            var kind = NormalizeKind(input.Kind);
            var name = NormalizeName(input.Name);
            var amount = NormalizeAmount(input.PlannedAmount);
            var plannedDate = NormalizeDate(input.PlannedDate);
            var periodKey = ToPeriodKey(plannedDate);
            var notes = NormalizeNotes(input.Notes);
            var (categoryId, subcategoryId) = await ValidateScopeAsync(userId, kind, input.CategoryId, input.SubcategoryId);
            await ValidateOwnershipAsync(userId, input.AccountId, input.MerchantId);

            var item = new BudgetItem
            {
                UserId = userId,
                PeriodKey = periodKey,
                Kind = kind,
                Name = name,
                PlannedAmount = amount,
                PlannedDate = plannedDate,
                CategoryId = categoryId,
                SubcategoryId = subcategoryId,
                AccountId = input.AccountId,
                MerchantId = input.MerchantId,
                Status = BudgetItemStatus.Pending,
                IsProjected = false,
                Source = BudgetItemSource.Manual,
                Notes = notes
            };

            try
            {
                await _repository.Save(item);
            }
            catch (DbUpdateException ex) when (IsNameCollision(ex))
            {
                throw new ArgumentException(NameConflictMessage, nameof(input));
            }

            return (await GetAsync(item.ItemId, userId))!;
        }

        /// <summary>
        /// Alta selectiva de la partida del periodo desde una plantilla existente, sin reescribir:
        /// la partida se deriva íntegra de la plantilla y queda ligada (<c>recurring_item_id</c> +
        /// <c>source=template</c>). Política ante campos manuales: <see cref="BudgetItemWriteInput.PlannedDate"/>
        /// solo aporta el mes destino (el día lo resuelve la plantilla con su regla de clamp); las
        /// notas se ignoran (la partida nace sin notas y se pueden editar después); cualquier otro
        /// campo manual presente y contradictorio con lo derivado se rechaza con 400 para evidenciar
        /// una plantilla obsoleta en el cliente, en vez de escribir silenciosamente algo distinto a
        /// lo prellenado. El duplicado usa el mismo claim idempotente del materializador: si la
        /// clave <c>(user_id, period_key, kind, name)</c> ya existe se responde 400, igual que el
        /// alta manual ante colisión de nombre.
        /// </summary>
        private async Task<BudgetItemListItem> CreateFromTemplateAsync(int userId, BudgetItemWriteInput input)
        {
            if (input.PlannedDate == default)
            {
                throw new ArgumentException(
                    "La fecha planificada es requerida para ubicar el periodo de la partida programada.",
                    nameof(input));
            }

            // El periodo se deriva del mes de la fecha recibida, igual que en el alta manual: fecha
            // y periodo nunca divergen. El día se ignora; lo fija la plantilla.
            var periodKey = ToPeriodKey(NormalizeDate(input.PlannedDate));

            var occurrence = await _recurringItems.ResolveOccurrenceAsync(
                userId,
                input.RecurringItemId!.Value,
                periodKey,
                CancellationToken.None);

            // Coherencia con lo prellenado desde la plantilla: un valor manual presente y distinto
            // indica que la plantilla cambió tras el prefill; se rechaza en vez de ignorarse.
            RejectWhenContradictsTemplate(input, occurrence);

            var claim = new BudgetItemClaim
            {
                UserId = userId,
                PeriodKey = occurrence.PeriodKey,
                Kind = occurrence.Kind,
                Name = occurrence.Name,
                PlannedAmount = occurrence.PlannedAmount,
                PlannedDate = occurrence.PlannedDate,
                CategoryId = occurrence.CategoryId,
                SubcategoryId = occurrence.SubcategoryId,
                AccountId = occurrence.AccountId,
                MerchantId = occurrence.MerchantId,
                RecurringItemId = occurrence.RecurringItemId,
                IsProjected = occurrence.IsProjected,
                Source = BudgetItemSource.Template
            };

            // ON CONFLICT DO NOTHING, como el materializador: una sola sentencia decide sin lectura
            // previa. Si otro proceso (o un doble clic) ya creó la ocurrencia, no se duplica.
            if (!await _repository.ClaimBudgetItemAsync(claim))
            {
                throw new ArgumentException(
                    "Esta programada ya tiene partida en este periodo.",
                    nameof(input));
            }

            var created = await ProjectListAsync(_repository.Get<BudgetItem>(i =>
                    i.UserId == userId &&
                    i.PeriodKey == occurrence.PeriodKey &&
                    i.Kind == occurrence.Kind &&
                    i.Name == occurrence.Name))
                .FirstOrDefaultAsync();

            // El claim acaba de insertar la fila con esta misma clave: solo faltaría si una purga o
            // borrado concurrente la eliminó entre ambas sentencias.
            return created!;
        }

        /// <summary>
        /// Guardia de prefill obsoleto: los campos manuales ausentes (texto vacío, cero o nulo) se
        /// derivan de la plantilla; los presentes deben coincidir con lo derivado. El día de
        /// <c>PlannedDate</c> y las notas nunca se comparan: el día lo fija la plantilla y las
        /// notas se ignoran en este camino.
        /// </summary>
        private static void RejectWhenContradictsTemplate(
            BudgetItemWriteInput input,
            RecurringTemplateOccurrence occurrence)
        {
            var kind = input.Kind?.Trim().ToLowerInvariant();
            if (!string.IsNullOrEmpty(kind) &&
                !string.Equals(kind, occurrence.Kind, StringComparison.Ordinal))
            {
                throw new ArgumentException(
                    "El tipo de la partida no coincide con el de la programada.",
                    nameof(input));
            }

            var name = input.Name?.Trim() ?? string.Empty;
            if (name.Length > 0 && !string.Equals(name, occurrence.Name, StringComparison.Ordinal))
            {
                throw new ArgumentException(
                    "El nombre no coincide con el de la programada; recarga las programadas e inténtalo de nuevo.",
                    nameof(input));
            }

            // Cero = ausente: los montos válidos siempre son mayores a cero.
            if (input.PlannedAmount != 0m && input.PlannedAmount != occurrence.PlannedAmount)
            {
                throw new ArgumentException(
                    "El monto no coincide con el de la programada; recarga las programadas e inténtalo de nuevo.",
                    nameof(input));
            }

            if (input.CategoryId.HasValue && input.CategoryId.Value != occurrence.CategoryId)
            {
                throw new ArgumentException(
                    "La categoría no coincide con la de la programada.",
                    nameof(input));
            }

            if (input.SubcategoryId.HasValue && input.SubcategoryId.Value != occurrence.SubcategoryId)
            {
                throw new ArgumentException(
                    "La subcategoría no coincide con la de la programada.",
                    nameof(input));
            }

            if (input.AccountId.HasValue && input.AccountId.Value != occurrence.AccountId)
            {
                throw new ArgumentException(
                    "La cuenta no coincide con la de la programada.",
                    nameof(input));
            }

            if (input.MerchantId.HasValue && input.MerchantId.Value != occurrence.MerchantId)
            {
                throw new ArgumentException(
                    "El comercio no coincide con el de la programada.",
                    nameof(input));
            }
        }

        public async Task<BudgetItemListItem?> UpdateAsync(int itemId, int userId, BudgetItemWriteInput input)
        {
            if (input == null) throw new ArgumentException("Budget item input is required.", nameof(input));

            var item = await _repository.GetTrack<BudgetItem>()
                .FirstOrDefaultAsync(i => i.ItemId == itemId && i.UserId == userId);

            if (item == null)
            {
                return null;
            }

            if (item.Status == BudgetItemStatus.Cancelled)
            {
                throw new BudgetConflictException("A cancelled budget item cannot be modified.");
            }

            // kind es inmutable: cambiarlo rompería el XOR de scope y la unicidad por nombre.
            var kind = NormalizeKind(input.Kind);
            if (!string.Equals(kind, item.Kind, StringComparison.Ordinal))
            {
                throw new ArgumentException("kind cannot be changed.");
            }

            var name = NormalizeName(input.Name);
            var amount = NormalizeAmount(input.PlannedAmount);
            var plannedDate = NormalizeDate(input.PlannedDate);
            var notes = NormalizeNotes(input.Notes);
            var (categoryId, subcategoryId) = await ValidateScopeAsync(userId, item.Kind, input.CategoryId, input.SubcategoryId);
            await ValidateOwnershipAsync(userId, input.AccountId, input.MerchantId);

            // Si la fecha cambia de mes, el periodo se recalcula; la colisión de nombre se valida
            // además contra el índice único para informar antes de escribir.
            var periodKey = ToPeriodKey(plannedDate);

            // executed es terminal: mover de mes una partida ejecutada saca su transacción del
            // periodo y deja el mes viejo sin la traza de plan (plannedAmount/variance), mientras el
            // gasto sigue contando en spent. Cambiar la fecha dentro del mismo mes sí es válido.
            if (item.Status == BudgetItemStatus.Executed &&
                !string.Equals(periodKey, item.PeriodKey, StringComparison.Ordinal))
            {
                throw new BudgetConflictException(ExecutedPeriodIsTerminalMessage);
            }

            item.PeriodKey = periodKey;
            item.Name = name;
            item.PlannedAmount = amount;
            item.PlannedDate = plannedDate;
            item.CategoryId = categoryId;
            item.SubcategoryId = subcategoryId;
            item.AccountId = input.AccountId;
            item.MerchantId = input.MerchantId;
            item.Notes = notes;

            try
            {
                await _repository.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (IsNameCollision(ex))
            {
                throw new ArgumentException(NameConflictMessage, nameof(input));
            }

            return await GetAsync(itemId, userId);
        }

        public async Task<bool> CancelAsync(int itemId, int userId)
        {
            var item = await _repository.GetTrack<BudgetItem>()
                .FirstOrDefaultAsync(i => i.ItemId == itemId && i.UserId == userId);

            if (item == null)
            {
                return false;
            }

            // Idempotente: cancelar una partida ya cancelada no es un conflicto, es el estado deseado.
            if (item.Status == BudgetItemStatus.Cancelled)
            {
                return true;
            }

            // executed es terminal: cancelarla violaría ck_budget_items_executed (23514 -> 500).
            if (item.Status == BudgetItemStatus.Executed)
            {
                throw new BudgetConflictException(ExecutedIsTerminalMessage);
            }

            item.Status = BudgetItemStatus.Cancelled;
            await _repository.SaveChangesAsync();
            return true;
        }

        public async Task<BudgetItemListItem?> SetStatusAsync(int itemId, int userId, string status)
        {
            var item = await _repository.GetTrack<BudgetItem>()
                .FirstOrDefaultAsync(i => i.ItemId == itemId && i.UserId == userId);

            if (item == null)
            {
                return null;
            }

            if (item.Status == BudgetItemStatus.Cancelled)
            {
                throw new BudgetConflictException("A cancelled budget item cannot change status.");
            }

            var target = NormalizeStatus(status);

            // executed es terminal: cualquier transición que la saque de executed violaría
            // ck_budget_items_executed (23514 -> 500, sin capturar). executed -> executed es no-op.
            if (item.Status == BudgetItemStatus.Executed && target != BudgetItemStatus.Executed)
            {
                throw new BudgetConflictException(ExecutedIsTerminalMessage);
            }

            if (target == BudgetItemStatus.Cancelled)
            {
                // cancelled solo se alcanza por el endpoint de cancelación, que libera el monto
                // de forma explícita y no depende de una transición de estado genérica.
                throw new ArgumentException("Use POST /api/budget-items/{id}/cancel to cancel a budget item.");
            }

            if (target == BudgetItemStatus.Executed && item.TransactionId == null)
            {
                // executed y transaction_id se sostienen mutuamente (ck_budget_items_executed): una
                // partida se vuelve ejecutada enlazando su transacción, no por decreto.
                throw new ArgumentException("A budget item is marked as executed by linking its transaction.");
            }

            item.Status = target;
            await _repository.SaveChangesAsync();

            return await GetAsync(itemId, userId);
        }

        public async Task<int> PurgeCancelledAsync(int userId, string? periodKey)
        {
            var period = ResolvePeriodKey(periodKey);

            if (!MonthRangeResolver.IsPeriodOpen(period))
            {
                throw new BudgetConflictException("Cancelled items can only be purged from an open period.");
            }

            // Borrado duro exclusivo de partidas cancelled: son las que ya liberaron su monto, así
            // que eliminar la fila no reabre nada. Las ejecutadas se conservan como historial.
            // Lectura RASTREADA: estas instancias se borran acto seguido con RemoveRange, y mezclar
            // una entidad AsNoTracking con otra ya rastreada del mismo ItemId rompe EF con
            // "another instance with the same key value is already being tracked".
            var items = await _repository.GetTrack<BudgetItem>()
                .Where(i =>
                    i.UserId == userId &&
                    i.PeriodKey == period &&
                    i.Status == BudgetItemStatus.Cancelled)
                .ToListAsync();

            if (items.Count == 0)
            {
                return 0;
            }

            return await _repository.RemoveRangeAsync(items);
        }

        private static IQueryable<BudgetItemListItem> ProjectListAsync(IQueryable<BudgetItem> items)
        {
            return items.Select(i => new BudgetItemListItem
            {
                ItemId = i.ItemId,
                PeriodKey = i.PeriodKey,
                Kind = i.Kind,
                Name = i.Name,
                PlannedAmount = i.PlannedAmount,
                PlannedDate = i.PlannedDate,
                CategoryId = i.CategoryId,
                SubcategoryId = i.SubcategoryId,
                AccountId = i.AccountId,
                MerchantId = i.MerchantId,
                RecurringItemId = i.RecurringItemId,
                Status = i.Status,
                IsProjected = i.IsProjected,
                TransactionId = i.TransactionId,
                Source = i.Source,
                Notes = i.Notes,
                Created = i.Created,
                Updated = i.Updated
            });
        }

        /// <summary>
        /// Mismo patrón que <c>BudgetService.ValidateScopeAsync</c>: XOR estricto de scope, propiedad
        /// (<c>UserId == userId || UserId == null</c>) y coherencia del <c>type</c> de la categoría con
        /// el <c>kind</c> de la partida. Un ingreso no admite subcategoría.
        /// </summary>
        private async Task<(int? CategoryId, int? SubcategoryId)> ValidateScopeAsync(
            int userId,
            string kind,
            int? categoryId,
            int? subcategoryId)
        {
            if (categoryId.HasValue == subcategoryId.HasValue)
            {
                throw new ArgumentException("Budget item scope must be exactly one of categoryId or subcategoryId.");
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
                    throw new ArgumentException($"Budget item category must be of type {expectedType}.");
                }

                return (categoryId, null);
            }

            if (kind == TransactionDomainConstants.TransactionType.Income)
            {
                throw new ArgumentException("An income budget item cannot use a subcategory.");
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
                throw new ArgumentException("Budget item subcategory must belong to an expense category.");
            }

            return (null, subcategoryId);
        }

        /// <summary>Valida que cuenta y comercio existan y sean propios (o globales).</summary>
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

        /// <summary>Periodo explícito normalizado, o el mes en curso cuando no se indica.</summary>
        private static string ResolvePeriodKey(string? periodKey)
        {
            if (string.IsNullOrWhiteSpace(periodKey))
            {
                return MonthRangeResolver.CurrentPeriodKey();
            }

            return NormalizePeriodKey(periodKey);
        }

        private static string NormalizePeriodKey(string periodKey)
        {
            var parsed = DateTime.TryParseExact(
                periodKey,
                "yyyy-MM",
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None,
                out _);

            if (!parsed)
            {
                throw new ArgumentException("period must use yyyy-MM format.", nameof(periodKey));
            }

            return periodKey;
        }

        /// <summary>Deriva <c>period_key</c> de la fecha planificada (yyyy-MM).</summary>
        private static string ToPeriodKey(DateTime plannedDate)
        {
            return $"{plannedDate.Year:D4}-{plannedDate.Month:D2}";
        }

        private static string NormalizeKind(string? value)
        {
            var kind = value?.Trim().ToLowerInvariant();
            if (kind != TransactionDomainConstants.TransactionType.Income && kind != TransactionDomainConstants.TransactionType.Expense)
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

        private static string NormalizeStatus(string? value)
        {
            var status = value?.Trim().ToLowerInvariant();
            if (status != BudgetItemStatus.Pending &&
                status != BudgetItemStatus.Executed &&
                status != BudgetItemStatus.Ignored &&
                status != BudgetItemStatus.Cancelled)
            {
                throw new ArgumentException("status must be one of: pending, executed, ignored, cancelled.", nameof(value));
            }

            return status;
        }

        private static string? NormalizeStatusOrNull(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            return NormalizeStatus(value);
        }

        private static string NormalizeName(string? value)
        {
            var name = value?.Trim() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("Budget item name is required.");
            }

            if (name.Length > MaxNameLength)
            {
                throw new ArgumentException($"Budget item name cannot exceed {MaxNameLength} characters.");
            }

            return name;
        }

        private static decimal NormalizeAmount(decimal amount)
        {
            var rounded = Math.Round(amount, 2, MidpointRounding.AwayFromZero);
            if (rounded <= 0m)
            {
                throw new ArgumentException("plannedAmount must be greater than zero.");
            }

            return rounded;
        }

        private static DateTime NormalizeDate(DateTime plannedDate)
        {
            // La columna es DATE: se conserva solo la parte de fecha, sin zona horaria.
            return DateTime.SpecifyKind(plannedDate.Date, DateTimeKind.Unspecified);
        }

        private static string? NormalizeNotes(string? notes)
        {
            if (string.IsNullOrWhiteSpace(notes))
            {
                return null;
            }

            var trimmed = notes.Trim();
            if (trimmed.Length > MaxNotesLength)
            {
                throw new ArgumentException($"Notes cannot exceed {MaxNotesLength} characters.");
            }

            return trimmed;
        }

        /// <summary>
        /// Carrera entre dos altas concurrentes: el chequeo previo pasó, pero el índice único rechazó
        /// la escritura. Se traduce a error de dominio (400) en vez de 500.
        /// </summary>
        private static bool IsNameCollision(DbUpdateException ex)
        {
            return ex.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: NameUniqueIndexName
            };
        }
    }
}
