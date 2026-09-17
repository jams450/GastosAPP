# Plan Fase 2 — Presupuestos mensuales y alertas por Telegram

Repo: `https://github.com/jams450/GastosAPP.git` (remoto real: `git remote -v`).
Dependencia: Fase 1 (chat IA de Telegram) completada según `docs/PLAN_FASE_1_TELEGRAM_IA.md`. La ubicación final de sus componentes se verificará al implementarla.

Este documento es ejecutable: cada tarea nombra archivo y verificación. No contiene secretos.

---

## 1. Objetivo

1. Reglas deterministas de categorización (`catalog_rules`) que asignen categoría/subcategoría sin LLM.
2. Presupuestos mensuales por categoría **o** subcategoría, en MXN, sin rollover.
3. Alertas cuando el gasto del mes cruza umbrales configurables.
4. Entrega de alertas **exclusivamente por Telegram**, idempotente en la creación y con outbox transaccional de entrega best-effort acotada.

---

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| CRUD de catálogos (categorías, subcategorías, comercios, etiquetas) | **Reutilizar** `CategoriesController`, `SubcategoriesController`, `MerchantsController`, `TagsController`. No se modifica su contrato. |
| Reglas | `catalog_rules` **simple**: match textual normalizado (`contains`/`equals`/`starts_with`) + filtros opcionales de tipo/`direction`/comercio/cuenta. Sin regex, sin LLM, sin scoring. |
| Alcance de presupuesto | **XOR**: `category_id` **o** `subcategory_id`, nunca ambos, nunca ninguno. |
| Moneda | **MXN** únicamente. Sin columna de moneda, sin conversión. |
| Rollover | **No**. Cada periodo `yyyy-MM` es independiente; el sobrante no acumula. |
| Fecha de imputación | `transactions.transaction_date` (fecha de compra), no fecha de corte ni de vencimiento. |
| Zona horaria | `America/Mexico_City`, vía `MonthRangeResolver` (`GastosApp.BusinessLogic/Services/MonthRangeResolver.cs`). Rango UTC semiabierto `[start, nextStart)`. |
| Gastos considerados | `type = 'expense'` y `transfer_group_id IS NULL`. Se excluyen transferencias (`transfer`, `transfer_in`, `transfer_out`), `opening_credit`, ingresos y pagos de crédito. |
| MSI / compras a crédito | Cuentan completo en la fecha de compra (decisión explícita: caja/compra, no devengado). |
| Umbrales | Tabla `budget_thresholds`, configurables por presupuesto. Defaults al crear: 80% y 100%. |
| Alertas | Solo Telegram (`Telegram.Bot` ya referenciado). Sin email, sin push, sin webhooks genéricos. |
| Idempotencia | Restricción `UNIQUE` en `alert_deliveries (budget_id, threshold_id, period_key)` + `INSERT ... ON CONFLICT DO NOTHING`. |
| Entrega | Patrón **outbox** (`alert_outbox`) + `BackgroundService` de .NET (`IHostedService`). |
| Prohibido | Cloudflare Workers, `ntfy`, Hangfire, Quartz, RabbitMQ, Redis, colas externas, cron del sistema, Dify/n8n. |
| Paquetes nuevos | **Ninguno**. `Microsoft.Extensions.Hosting` viene en el shared framework de ASP.NET Core. |

---

## 3. Estado actual verificado (leer antes de tocar)

| Hecho | Evidencia |
|---|---|
| Tablas y columnas se definen en SQL a mano; **no hay EF migrations** | `SQL/schema.sql`, `SQL/migrations/*.sql` con nombre `YYYY-MM-DD_descripcion.sql` |
| El esquema no se aplica automáticamente en `docker-compose.yml` | `docker-compose.yml` no monta `schema.sql` |
| `ContextSqlGastos` aplica auditoría (`created_at`, `updated_at`, `created_by`, `updated_by`) sobre `BaseModel` | `GastosApp.BusinessLogic/Context/ContextSqlGastos.cs` → `ApplyAuditInfo()` |
| Sin `HttpContext`, `ICurrentUserService.GetName()` devuelve `"System"` | `GastosApp.API/Services/CurrentUserService.cs` |
| Servicios registrados en un solo lugar, todos `AddScoped` | `GastosApp.API/Extensions/ServiceCollectionExtensions.cs` |
| Tipos de transacción válidos en dominio | `GastosApp.BusinessLogic/Models/Transactions/TransactionDomainConstants.cs` |
| Telegram ya lee `Telegram:BotToken`, `AllowedUserId`, `AppUserId`, `Enabled` | `GastosApp.API/Configuration/TelegramOptions.cs`, `GastosApp.API/Extensions/TelegramConfigurationExtensions.cs` |
| Envío actual: `new TelegramBotClient(options.BotToken)` + `SendMessage(chatId, texto)` | `GastosApp.API/Services/Telegram/TelegramUpdateService.cs` |
| Escrituras de gasto pasan por `CreateExpenseAsync(Transaction, int userId, ...)` | `GastosApp.BusinessLogic/Services/TransactionCommandService.cs` |
| Categorías/subcategorías pueden ser globales (`user_id NULL`) | `SQL/schema.sql` (`categories`, `subcategories`) |
| No existen proyectos de test | repo sin `*Tests*.csproj` |

---

## 4. Modelo de datos

Cinco tablas nuevas. DDL exacto a pegar en la migración (ver §5).

### 4.1 `catalog_rules`

```sql
CREATE TABLE catalog_rules (
    rule_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    match_field VARCHAR(20) NOT NULL CHECK (match_field IN ('description', 'merchant')),
    match_type VARCHAR(20) NOT NULL CHECK (match_type IN ('contains', 'equals', 'starts_with')),
    match_value VARCHAR(200) NOT NULL,          -- normalizado (minúsculas, sin acentos, espacios colapsados)
    type VARCHAR(20) NULL CHECK (type IS NULL OR type IN ('income', 'expense')),
    direction VARCHAR(10) NULL CHECK (direction IS NULL OR direction IN ('debit', 'credit')),
    merchant_id INT NULL,
    account_id INT NULL,
    target_category_id INT NULL,
    target_subcategory_id INT NULL,
    priority INT NOT NULL DEFAULT 100,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE SET NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE SET NULL,
    FOREIGN KEY (target_category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
    FOREIGN KEY (target_subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE CASCADE,
    CONSTRAINT catalog_rules_target_chk
        CHECK (target_category_id IS NOT NULL OR target_subcategory_id IS NOT NULL)
);

CREATE INDEX idx_catalog_rules_user_active ON catalog_rules (user_id, active, priority);
```

Semántica: la regla aplica si **todos** los filtros no nulos coinciden (AND). Gana la de `priority` menor (0 = máxima); empate → `rule_id` menor. Primera coincidencia aplica; no hay encadenamiento ni múltiples reglas por transacción.

### 4.2 `budgets`

```sql
CREATE TABLE budgets (
    budget_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    period_key CHAR(7) NOT NULL,                -- 'yyyy-MM' en America/Mexico_City
    name VARCHAR(120) NOT NULL,
    category_id INT NULL,
    subcategory_id INT NULL,
    amount_mxn DECIMAL(15, 2) NOT NULL CHECK (amount_mxn > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
    FOREIGN KEY (subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE CASCADE,
    CONSTRAINT budgets_scope_chk CHECK ((category_id IS NULL) <> (subcategory_id IS NULL))
);

CREATE UNIQUE INDEX ux_budgets_user_period_scope
    ON budgets (user_id, period_key, COALESCE(category_id, 0), COALESCE(subcategory_id, 0));
```

`period_key` es obligatorio y explícito (no hay presupuesto "recurrente" en v1; crear el del mes nuevo es una fila nueva, ver §7.4).

### 4.3 `budget_thresholds`

```sql
CREATE TABLE budget_thresholds (
    threshold_id SERIAL PRIMARY KEY,
    budget_id INT NOT NULL,
    name VARCHAR(60) NOT NULL,                  -- 'Aviso', 'Limite', ...
    percent DECIMAL(5, 2) NOT NULL CHECK (percent > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (budget_id) REFERENCES budgets(budget_id) ON DELETE CASCADE,
    UNIQUE (budget_id, percent)
);
```

`percent` puede ser > 100 (p. ej. 120) para avisar sobregiro. No hay umbral global compartido en v1.

### 4.4 `alert_deliveries` (idempotencia)

```sql
CREATE TABLE alert_deliveries (
    delivery_id SERIAL PRIMARY KEY,
    budget_id INT NOT NULL,
    threshold_id INT NOT NULL,
    user_id INT NOT NULL,
    period_key CHAR(7) NOT NULL,
    budget_amount DECIMAL(15, 2) NOT NULL,
    spent_amount DECIMAL(15, 2) NOT NULL,
    percent_used DECIMAL(7, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (budget_id) REFERENCES budgets(budget_id) ON DELETE CASCADE,
    FOREIGN KEY (threshold_id) REFERENCES budget_thresholds(threshold_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (budget_id, threshold_id, period_key)
);
```

Esta `UNIQUE` **es** el candado de idempotencia: mismo presupuesto + mismo umbral + mismo mes ⇒ una sola fila, aunque el evaluador corra cada hora o el contenedor se reinicie.

### 4.5 `alert_outbox`

```sql
CREATE TABLE alert_outbox (
    outbox_id SERIAL PRIMARY KEY,
    delivery_id INT NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'telegram' CHECK (channel = 'telegram'),
    payload TEXT NOT NULL,                      -- texto plano ya renderizado, sin secretos
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    last_error VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    FOREIGN KEY (delivery_id) REFERENCES alert_deliveries(delivery_id) ON DELETE CASCADE,
    UNIQUE (delivery_id)
);

CREATE INDEX idx_alert_outbox_pending ON alert_outbox (status, next_attempt_at);
```

`payload` se materializa al momento de crear la entrega (el texto ya calculado queda congelado; no se recalcula al enviar).

### 4.6 Entidades C#

- `GastosApp.Models/Entities/CatalogRule.cs` → tabla `catalog_rules`
- `GastosApp.Models/Entities/Budget.cs` → tabla `budgets`
- `GastosApp.Models/Entities/BudgetThreshold.cs` → tabla `budget_thresholds`
- `GastosApp.Models/Entities/AlertDelivery.cs` → tabla `alert_deliveries`
- `GastosApp.Models/Entities/AlertOutbox.cs` → tabla `alert_outbox`

Todas heredan `BaseModel` (`GastosApp.Models/Models/BaseModel.cs`) y usan `[Table]`/`[Column]` en snake_case, igual que las entidades existentes.

`ContextSqlGastos.cs`: agregar `DbSet<>` de las cinco entidades + en `OnModelCreating` los índices únicos compuestos y las FKs `OnDelete` equivalentes al DDL (Cascade para hijos de `budgets`/`deliveries`, `SetNull` para `merchant_id`/`account_id`).

---

## 5. Migración y despliegue de esquema

1. Crear `SQL/migrations/2026-09-16_fase2_budgets_alerts.sql` con el DDL de §4 (idempotente: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
2. Agregar **las mismas sentencias idempotentes** al final de `SQL/schema.sql` para instalaciones nuevas.
3. Aplicar a mano en el Postgres del stack (no hay runner automático):
   `psql "$ConnectionStrings__DefaultConnection" -f SQL/migrations/2026-09-16_fase2_budgets_alerts.sql`
4. Verificar: `\d budgets`, `\d catalog_rules`, `\d alert_outbox` y que exista `ux_budgets_user_period_scope`.
5. Crear un presupuesto de prueba y confirmar `INSERT` duplicado de `alert_deliveries` con el mismo `(budget_id, threshold_id, period_key)` → error de unicidad (controlado por `ON CONFLICT DO NOTHING`).

---

## 6. Reglas deterministas (`catalog_rules`)

### 6.1 Normalización

Nueva utilidad única: `GastosApp.BusinessLogic/Services/CatalogTextNormalizer.cs`.

```csharp
public static string Normalize(string? value) // trim, lower, quitar acentos, colapsar espacios
```

Se aplica a `match_value` al guardar la regla y a `description`/`Merchant.NormalizedName` al evaluar. `Merchant.NormalizedName` ya existe (`SQL/schema.sql`), se reutiliza tal cual.

### 6.2 Servicio

`GastosApp.BusinessLogic/Services/CatalogRuleService.cs` (`ICatalogRuleService` en `Interfaces/`):

- `GetAllByUserIdAsync`, `GetByIdAsync(id, userId)`, `CreateAsync`, `UpdateAsync`, `SetActiveAsync` — mismo patrón que `CategoryService`/`CategoriesController` (validación de propiedad del usuario, `active` como borrado lógico).
- `ResolveAsync(int userId, RuleMatchInput input)` → devuelve `(targetCategoryId, targetSubcategoryId)?` con primera coincidencia por `priority`, `rule_id`.
- `ApplyAsync(int userId, CatalogRuleApplyOptions options)` → aplica reglas a transacciones existentes; `dryRun = true` por default; `onlyUncategorized = true` por default.

Validaciones obligatorias al crear/editar:

- `target_subcategory_id` debe pertenecer a su `category_id`; si la regla trae subcategoría, el target de categoría se deriva de la subcategoría.
- `target_category_id` y `merchant_id`/`account_id` deben ser del usuario o globales (`user_id IS NULL`), igual que hace `TransactionValidationService.ValidateAnalyticsDimensionsAsync`.
- `match_value` no vacío tras normalizar.
- `type`/`direction` opcionales; si se informan, deben ser valores válidos.

### 6.3 Hook de aplicación en escrituras

En `TransactionCommandService.CreateExpenseAsync` (y `CreateIncomeAsync`), **antes** de `ValidateAnalyticsDimensionsAsync`: si `transaction.CategoryId is null && transaction.SubcategoryId is null`, llamar `ICatalogRuleService.ResolveAsync`. Solo se aplica cuando el usuario no especificó dimensión; **nunca sobrescribe** valores explícitos. Inyectar `ICatalogRuleService` en el constructor de `TransactionCommandService` (mismo proyecto, sin ciclo: `CatalogRuleService` no depende de `ITransactionCommandService`).

Sin migración de datos: las transacciones históricas solo cambian si se ejecuta `POST /api/catalog-rules/apply`.

---

## 7. Presupuestos mensuales

### 7.1 Cálculo de gasto (SQL determinista)

`GastosApp.BusinessLogic/Services/BudgetService.cs`:

```sql
SELECT COALESCE(SUM(t.amount), 0)
FROM transactions t
JOIN accounts a ON a.account_id = t.account_id
WHERE a.user_id = @userId
  AND t.type = 'expense'
  AND t.transfer_group_id IS NULL
  AND t.transaction_date >= @startUtc        -- MonthRangeResolver
  AND t.transaction_date <  @nextStartUtc
  AND (@categoryId    IS NULL OR t.category_id    = @categoryId)
  AND (@subcategoryId IS NULL OR t.subcategory_id = @subcategoryId)
```

Notas:
- El scope de usuario se aplica por `accounts.user_id` (mismo criterio que `DashboardService`), **no** por `categories.user_id`, porque las categorías pueden ser globales.
- Se agrega por el filtro del presupuesto: presupuesto por categoría suma la categoría completa (incluye sus subcategorías); presupuesto por subcategoría suma solo esa subcategoría.
- Rango semiabierto → sin off-by-one en fin de mes.

### 7.2 Estados

`spent`, `remaining = amount_mxn - spent`, `percent_used = spent / amount_mxn * 100` (redondeado a 2 decimales, `decimal`, no `double`).

`status`: `ok` (< primer umbral activo), `warning` (≥ primer umbral), `exceeded` (≥ 100 o ≥ umbral máximo activo).

### 7.3 Umbrales

- Al crear presupuesto sin umbrales explícitos → insertar 80 y 100 (`GastosApp.BusinessLogic/Services/BudgetService.cs`, no trigger).
- `PUT /api/budgets/{id}/thresholds` reemplaza el set completo (borrar + insertar dentro de la misma transacción, `Repository.ExecuteInTransactionAsync`), propagando a las entregas ya creadas vía `ON DELETE CASCADE` solo si se borra el umbral.
- Validar: `percent > 0`, sin duplicados, máximo 10 umbrales por presupuesto.

### 7.4 Sin rollover

No hay cálculo acumulado entre meses. Para el mes siguiente el usuario crea otro presupuesto con su `period_key`. Endpoint de comodidad (opcional, no bloquea v1): `POST /api/budgets/{id}/clone` con `{ "periodKey": "yyyy-MM" }` que copia monto y umbrales sin copiar entregas.

---

## 8. Alertas por Telegram

### 8.1 Evaluación

`GastosApp.BusinessLogic/Services/AlertEvaluationService.cs`:

```
para cada usuario con budgets activos y period_key = mes actual (America/Mexico_City):
  para cada budget activo:
    spent = calcular (§7.1)
    si spent == 0 → nada
    percentUsed = round(spent / amount_mxn * 100, 2)
    cruzados = thresholds activos con percent <= percentUsed, ordenados por percent desc
    si no hay cruzados → nada
    elegido = primer cruzado SIN delivery existente para (budget, threshold, period_key)
    si no existe → nada
    INSERT alert_deliveries (...) ON CONFLICT (budget_id, threshold_id, period_key) DO NOTHING
    si insertó (1 fila) → INSERT alert_outbox (delivery_id, payload = texto renderizado)
```

Regla anti-tormenta: se evalúa el **umbral más alto cruzado sin entrega previa**, no todos. Efecto: 81% → aviso 80%; al pasar 100% en el mismo mes → aviso 100% (una sola vez); si el primer cálculo del mes ya da 105%, se envía solo el de 100%.

Texto (español, sin secretos, ≤ 4000 caracteres):

```
Presupuesto "Comida" · 2026-09
Gastado: $8,120.00 de $10,000.00 (81.20%)
Umbral alcanzado: Aviso (80%)
Restante: $1,880.00
```

Ambos `INSERT` van en **una sola transacción** (`ExecuteInTransactionAsync`): o existe entrega con su outbox, o no existe nada.

### 8.2 Envío (outbox + BackgroundService)

`GastosApp.API/BackgroundServices/AlertDispatchBackgroundService.cs` (`BackgroundService`):

```
loop cada AlertDispatchSeconds (default 30):
  scope = scopeFactory.CreateScope()
  Lote = alert_outbox WHERE status='pending' AND next_attempt_at <= NOW() ORDER BY outbox_id LIMIT BatchSize
  para cada fila:
    intentar enviar por ITelegramAlertSender
    ok  → status='sent', sent_at=NOW(), attempts+1
    fallo → attempts+1; si attempts >= MaxAttempts → status='failed'; last_error=truncado(500)
            si no → next_attempt_at = NOW() + min(2^attempts * 30s, 30min)
  expirar: pending con created_at < NOW() - 7 días → status='failed', last_error='expired'
```

`GastosApp.API/Services/Telegram/TelegramAlertSender.cs` (`ITelegramAlertSender`): envía a `TelegramOptions.AllowedUserId` como `chatId` usando `new TelegramBotClient(options.BotToken)` + `SendMessage`, mismo patrón que `TelegramUpdateService`. **Nunca** se toma `chat_id` de la DB ni del request.

Si `Telegram:Enabled = false`, el evaluador **sí** crea entregas y outbox (auditoría histórica), y el dispatcher no envía: se registra `Debug` y se deja `pending`. Al habilitar, se drena el pendiente vigente y lo mayor a 7 días se marca `failed`.

`GastosApp.API/BackgroundServices/AlertEvaluationBackgroundService.cs` (`BackgroundService`): ejecuta la evaluación cada `Alerts:EvaluationIntervalMinutes` (default 60) y una vez al arrancar. Sin cálculo de "hora exacta": la idempotencia hace inocuo repetir, y 60 min es suficiente granularidad para umbrales de 80/100%.

Ceiling conocido: un solo contenedor `api`, sin lock distribuido. Si algún día hay réplicas, cambiar el `SELECT` a `FOR UPDATE SKIP LOCKED`.

### 8.3 Reintentos manuales

`POST /api/alerts/outbox/{id}/retry` (autenticado) reencola un `failed` a `pending` con `attempts = 0`. Útil para validación y para credenciales rotadas.

---

## 9. Endpoints

Todos `[Authorize(Policy = "UserWithId")]`, con el `userId` obtenido de `ICurrentUserService` y **nunca** del body/query. Errores con `{ Message }` como el resto del API.

### `CatalogRulesController` — `api/catalog-rules`

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/catalog-rules` | filtros `active`, `q` opcional |
| GET | `/api/catalog-rules/{id}` | 404 si no es del usuario |
| POST | `/api/catalog-rules` | valida targets y normaliza `match_value` |
| PUT | `/api/catalog-rules/{id}` | |
| PATCH | `/api/catalog-rules/{id}/active` | body `bool`, borrado lógico |
| POST | `/api/catalog-rules/apply` | body `{ dryRun: true, from, to, onlyUncategorized: true }`; devuelve `{ evaluated, matched, updated }` |

### `BudgetsController` — `api/budgets`

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/budgets?period=yyyy-MM` | default mes actual en `America/Mexico_City` |
| GET | `/api/budgets/{id}` | |
| POST | `/api/budgets` | body con `periodKey`, scope XOR, `amountMxn`, `thresholds[]` opcional |
| PUT | `/api/budgets/{id}` | no permite cambiar `user_id` ni `period_key` |
| PATCH | `/api/budgets/{id}/active` | |
| GET | `/api/budgets/status?period=yyyy-MM` | `spent`, `remaining`, `percentUsed`, `status`, umbral cruzado |
| PUT | `/api/budgets/{id}/thresholds` | reemplazo completo |

### `AlertsController` — `api/alerts`

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/alerts/deliveries?period=yyyy-MM` | historial |
| GET | `/api/alerts/outbox?status=pending` | diagnóstico |
| POST | `/api/alerts/evaluate` | dispara evaluación ahora (idempotente); sirve para validar sin esperar al timer |
| POST | `/api/alerts/outbox/{id}/retry` | reencolar |

Códigos: 400 para scope XOR inválido / umbral inválido / target ajeno; 404 para recursos de otro usuario; 500 con `{ Message }` genérico y log sin datos financieros.

---

## 10. Archivos nuevos y DI

Nuevos:

- `GastosApp.Models/Entities/{CatalogRule,Budget,BudgetThreshold,AlertDelivery,AlertOutbox}.cs`
- `GastosApp.BusinessLogic/Interfaces/{ICatalogRuleService,IBudgetService,IAlertEvaluationService}.cs`
- `GastosApp.BusinessLogic/Services/{CatalogTextNormalizer,CatalogRuleService,BudgetService,AlertEvaluationService}.cs`
- `GastosApp.API/Controllers/{CatalogRulesController,BudgetsController,AlertsController}.cs`
- `GastosApp.API/Models/{CatalogRules,Budgets,Alerts}/*.cs` (requests/responses, un archivo por tipo como en `Models/Categories/`)
- `GastosApp.API/Configuration/AlertsOptions.cs` + `GastosApp.API/Extensions/AlertsConfigurationExtensions.cs`
- `GastosApp.API/Services/Telegram/{ITelegramAlertSender,TelegramAlertSender}.cs`
- `GastosApp.API/BackgroundServices/{AlertEvaluationBackgroundService,AlertDispatchBackgroundService}.cs`
- `SQL/migrations/2026-09-16_fase2_budgets_alerts.sql`

Modificados (mínimos):

- `GastosApp.BusinessLogic/Context/ContextSqlGastos.cs` — DbSets + mapeos
- `GastosApp.BusinessLogic/Services/TransactionCommandService.cs` — hook de reglas (§6.3)
- `GastosApp.API/Extensions/ServiceCollectionExtensions.cs` — `AddScoped` de los servicios nuevos + `AddHostedService<AlertEvaluationBackgroundService>()` y `AddHostedService<AlertDispatchBackgroundService>()`
- `GastosApp.API/Program.cs` — `.AddApiAlertsConfiguration(builder.Configuration)` en la cadena
- `SQL/schema.sql` — DDL idempotente de §4
- `docker-compose.yml` + `.env.example` — placeholders `Alerts__*` (valores no secretos)

`AlertsOptions` (`SectionName = "Alerts"`): `Enabled` (bool), `EvaluationIntervalMinutes` (int, default 60), `DispatchSeconds` (int, default 30), `BatchSize` (int, default 20), `MaxAttempts` (int, default 5). Validación fail-fast solo si `Enabled = true`, mismo criterio que `TelegramConfigurationExtensions`.

---

## 11. Configuración (sin secretos)

`appsettings.json` (placeholders, sin valores reales):

```json
"Alerts": {
  "Enabled": false,
  "EvaluationIntervalMinutes": 60,
  "DispatchSeconds": 30,
  "BatchSize": 20,
  "MaxAttempts": 5
}
```

Variables Docker: `Alerts__Enabled`, `Alerts__EvaluationIntervalMinutes`, `Alerts__DispatchSeconds`, `Alerts__BatchSize`, `Alerts__MaxAttempts`.

**No se agregan secretos nuevos.** El bot token, `AllowedUserId` y `AppUserId` ya existen y se reutilizan tal cual. `AllowedUserId` es a la vez el `chat_id` destino (v1 single-user).

---

## 12. Seguridad

1. Endpoints nuevos bajo `[Authorize(Policy = "UserWithId")]`; `userId` siempre del JWT vía `ICurrentUserService`, nunca del payload.
2. Validar propiedad (o `user_id IS NULL` global) de `category_id`, `subcategory_id`, `merchant_id`, `account_id` antes de persistir reglas o presupuestos.
3. El `BackgroundService` no usa `HttpContext`: crea scope con `IServiceScopeFactory`, `created_by` queda `"System"` (comportamiento verificado de `CurrentUserService`).
4. El único destino de Telegram es `Telegram:AllowedUserId`. No hay endpoint para enviar mensajes arbitrarios.
5. No se guarda en DB ni se loguea `BotToken`, `WebhookSecret`, `Llm:ApiKey`, ni contenido de `.env`.
6. Logs: solo `delivery_id`, `outbox_id`, `status`, `attempts` y conteos. Nunca montos, descripciones ni `payload`.
7. El `payload` del outbox es texto de presupuesto (dato financiero) → no se expone en logs ni en respuestas de error.
8. Rate limit natural: máximo un mensaje por (presupuesto, umbral, mes) y lote acotado por `BatchSize`.
9. `POST /api/alerts/evaluate` es idempotente: no genera duplicados ni siquiera si se invoca en paralelo con el timer (la `UNIQUE` decide).

---

## 13. Exclusiones explícitas

- Sin Workers de Cloudflare, sin `ntfy`, sin Hangfire, sin Quartz, sin RabbitMQ, sin Redis, sin colas externas, sin cron del sistema.
- Sin LLM en reglas, en el cálculo de presupuesto ni en el texto de alertas: todo determinista.
- Sin soporte multimoneda, sin conversión de divisas, sin presupuestos en USD.
- Sin rollover, sin presupuestos anuales/trimestrales, sin presupuesto global por "todas las categorías".
- Sin notificaciones por email/push/WhatsApp.
- Sin multi-usuario en Telegram: una allowlist, un `AppUserId`.
- Sin frontend en esta fase (los endpoints quedan listos para el BFF de `GastosApp.Web`).
- Sin modificación del CRUD existente de catálogos.
- Sin edición de presupuestos del pasado ya cerrados (un mes pasado solo se consulta).

---

## 14. Orden de ejecución

### Fase 2.1 — Esquema y entidades (0.5–1 día)

1. `SQL/migrations/2026-09-16_fase2_budgets_alerts.sql` + `SQL/schema.sql`.
2. Entidades en `GastosApp.Models/Entities/`.
3. Mapeos en `ContextSqlGastos.cs`.
4. Aplicar migración y verificar con `\d`.

### Fase 2.2 — Reglas deterministas (1–1.5 días)

1. `CatalogTextNormalizer`.
2. `ICatalogRuleService` + `CatalogRuleService` (CRUD + `ResolveAsync` + `ApplyAsync`).
3. `CatalogRulesController` + modelos de request/response.
4. Hook en `TransactionCommandService`.
5. DI en `ServiceCollectionExtensions`.

### Fase 2.3 — Presupuestos y umbrales (1–1.5 días)

1. `IBudgetService` + `BudgetService` (cálculo §7.1, XOR, umbrales default, `status`).
2. `BudgetsController` + modelos.
3. Validaciones de propiedad y de XOR.

### Fase 2.4 — Alertas y outbox (1.5–2 días)

1. `AlertsOptions` + `AlertsConfigurationExtensions` + `Program.cs`.
2. `AlertEvaluationService` (detección + inserción transaccional entrega/outbox).
3. `ITelegramAlertSender` + `TelegramAlertSender`.
4. `AlertDispatchBackgroundService` + `AlertEvaluationBackgroundService`.
5. `AlertsController`.
6. `AddHostedService` y variables en `docker-compose.yml` / `.env.example`.

### Fase 2.5 — Validación y endurecimiento (1 día)

1. Matriz de §15 completa.
2. Revisar logs sin secretos ni montos.
3. Documentar rollback: `Alerts__Enabled=false` detiene evaluación y envío sin migración.

Total estimado: **5–7 días**.

---

## 15. Criterios de aceptación

Funcionales:

1. Una regla `match_type=contains`, `match_value="oxxo"` categoriza un gasto nuevo con descripción `"OXXO Reforma"` cuando el request no trae categoría.
2. La misma regla **no** sobrescribe un gasto que sí trae `categoryId` explícito.
3. Regla con `priority` menor gana sobre la de mayor; empate resuelto por `rule_id`.
4. `POST /api/budgets` con `categoryId` **y** `subcategoryId` → 400. Con ninguno → 400.
5. Presupuesto por categoría suma sus subcategorías; presupuesto por subcategoría suma solo esa.
6. Una transferencia entre cuentas no incrementa el gastado de ningún presupuesto.
7. Un ingreso y un `opening_credit` no incrementan el gastado.
8. Un gasto del 31 a las 23:30 hora de México cae en el mes correcto.
9. Presupuesto de $10,000 con gasto $8,120 → 1 entrega para el umbral 80% y ninguna para 100%.
10. Al llegar a $10,500 → 1 entrega para 100% (hubo 80% antes) y ninguna nueva para 80%.
11. Ejecutar la evaluación 10 veces no crea entregas ni mensajes extra.
12. Reiniciar el contenedor entre evaluación y envío no pierde ni duplica la alerta.
13. Telegram deshabilitado: se crean entregas/outbox, no se envía nada, no hay excepción.
14. Telegram habilitado después: se envía el pendiente del mes vigente.
15. Fallo de Telegram (token inválido) → `attempts` sube, `next_attempt_at` retrocede con backoff, `last_error` sin secretos, y a los `MaxAttempts` queda `failed`.
16. `POST /api/alerts/outbox/{id}/retry` reencola un `failed`.

Seguridad:

17. Ningún endpoint nuevo responde 200 sin JWT válido.
18. Usuario B no ve ni modifica reglas, presupuestos, entregas u outbox de A (404/400, nunca 403 con datos).
19. Crear regla con `target_subcategory_id` de otro usuario → 400.
20. `grep` de `BotToken`, `WebhookSecret`, `ApiKey` en logs de la corrida de prueba → sin resultados.
21. No existe ningún endpoint que acepte `chat_id` como parámetro.

---

## 16. Validación (comandos y matriz)

Build:

```bash
dotnet restore code.sln
dotnet build code.sln
```

API local + smoke de auth (según `AGENTS.md`):

```bash
dotnet run --project GastosApp.API/GastosApp.API.csproj
# POST /api/auth/login  (dev: http://localhost:5181)
```

Comprobaciones de esquema:

```bash
psql "$ConnectionStrings__DefaultConnection" -c '\d budgets'
psql "$ConnectionStrings__DefaultConnection" -c '\d alert_deliveries'
psql "$ConnectionStrings__DefaultConnection" -c '\d alert_outbox'
```

Matriz funcional (usar `POST /api/alerts/evaluate` para no depender del timer):

| # | Caso | Esperado |
|---|---|---|
| 1 | Gasto en categoría con presupuesto, mes actual, 50% | 0 entregas |
| 2 | Mismo presupuesto al 81% | 1 entrega (umbral 80), 1 outbox `sent` |
| 3 | Re-evaluar sin nuevos gastos | 0 entregas nuevas |
| 4 | Subir el umbral 80→85 estando al 81% | 0 entregas (85 no cruzado) |
| 5 | Bajar umbral 85→70 | 1 entrega nueva (70) |
| 6 | Gasto en subcategoría hermana de un presupuesto por subcategoría | 0 impacto |
| 7 | Gasto en subcategoría de un presupuesto por categoría | Impacta |
| 8 | Transferencia entre cuentas | 0 impacto |
| 9 | Gasto con `transaction_date` 2026-08-31T23:30-06:00 | Mes 08 |
| 10 | Telegram deshabilitado | Outbox `pending`, sin excepción |
| 11 | Token inválido | `attempts` sube, backoff aplicado |
| 12 | `dryRun=true` en apply | 0 filas modificadas en DB, conteos > 0 |

Sin tests automatizados en el repo: la verificación es build + corrida manual + inspección SQL, igual que en fases previas. Si se quiere una red de seguridad barata, agregar un único `assert`-style self-check de `CatalogTextNormalizer.Normalize` (casos: mayúsculas, acentos, espacios múltiples) — no un proyecto de tests.

---

## 17. Riesgos

| Riesgo | Mitigación |
|---|---|
| Hook de reglas altera el flujo de dinero en `TransactionCommandService` | Solo actúa si categoría y subcategoría son null; try/catch que registra y continúa sin categorizar si el evaluador falla; validación de dimensiones sigue intacta después del hook |
| Migración SQL manual olvidada en un entorno | DDL idempotente + verificación `\d` obligatoria antes de desplegar código |
| Cambios de umbral dejan entregas huérfanas | `ON DELETE CASCADE` en umbral + reemplazo transaccional del set |
| Backfill de reglas masivo e irreversible | `dryRun` por defecto, filtro `onlyUncategorized`, devolución de conteos antes/después |
| Ventana SQL vs `DateTime.UtcNow` | Siempre `MonthRangeResolver`; nunca `DateTime.Now` ni truncado local |
| Envío duplicado tras reinicio | `UNIQUE (budget_id, threshold_id, period_key)` + outbox único por entrega |
| Alertas acumuladas tras meses con Telegram apagado | Expiración a `failed` a los 7 días |
| Fuga de datos financieros a logs | Solo IDs y estados; `payload` nunca se loguea |
| Falsos "sin impacto" si `type` cambia en el dominio | Reutilizar `TransactionDomainConstants.TransactionType.Expense` en el filtro, no el literal |

---

## 18. Pendientes de verificación (no bloquean el arranque)

1. Confirmar el `chat_id` real de `Telegram:AllowedUserId` en la corrida de prueba (es el mismo usuario de Fase 1).
2. Confirmar que `Telegram:AppUserId` corresponde a un usuario activo con cuentas y transacciones.
3. Decidir si el frontend (`GastosApp.Web` + BFF) consume `GET /api/budgets/status` en esta fase o en la siguiente. No cambia el backend.
4. Medir volumen real de transacciones para validar que el índice `idx_alert_outbox_pending` y el `SELECT` del evaluador son suficientes (esperado: cientos de filas, no miles).
