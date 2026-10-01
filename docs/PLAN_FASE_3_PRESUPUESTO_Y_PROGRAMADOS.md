# Plan Fase 3 — Presupuesto planificado vs ejecutado y Gastos/Ingresos programados

> Complementa `docs/PLAN_FASE_2_PRESUPUESTOS_ALERTAS.md`. No lo reemplaza.
> Estado del arte verificado antes de escribir: ver sección 2.

**Esta fase entrega dos módulos que comparten el mismo motor de datos:**

| Módulo | Qué es | Dónde vive la pantalla |
|---|---|---|
| **Presupuesto planificado vs ejecutado** | El presupuesto deja de medir solo gasto ejecutado: suma partidas planificadas y desglosa ambos montos | Sección nueva dentro de `Presupuestos` (sección 8.2) |
| **Gastos/Ingresos programados** | Plantillas recurrentes (`cobro de renta`, `pago de nómina`) que se materializan cada mes. Los gastos con cuenta pueden además ejecutarse solos (sección 4.6) | **Catálogo en `Catálogos`**, admin como el resto (sección 8.3) + botón en el **histórico** (sección 8.7) |

Ambos leen y escriben la misma tabla de partidas. La diferencia es de **puerta de entrada**, no de datos.

---

## 1. Objetivo

**Parte A — Presupuesto planificado vs ejecutado.** Hoy el presupuesto es **una foto del gasto ya ejecutado**. Esta parte lo convierte en un **plan del mes**:

1. El presupuesto se **reutiliza** mes a mes sin recapturar todo (copiar + remontar programados).
2. Existen **partidas planificadas con fecha** (gastos e ingresos) que puedes registrar a mano.
3. Una partida planificada **cuenta en el presupuesto aunque todavía no exista la transacción**, y te alerta cuando llega su día sin ejecutarse.
4. Al ejecutarse, la transacción **se enlaza** a su partida y deja de contar doble.
5. El usuario puede **editar, desactivar y eliminar** presupuestos y partidas (con las restricciones reales de sección 2.5).

**Parte B — Gastos/Ingresos programados.** Una pantalla donde defines lo que se repite todos los meses, y un botón en el histórico que convierte un gasto que ya hiciste en uno programado sin recapturarlo.

6. **Catálogo de programadas**, admin como todo el resto: nombre, tipo (gasto/ingreso), monto, día del mes, **fecha efectiva manual** (sección 4.7), cuenta, categoría, comercio y vigencia.
7. **Botón en el histórico** que promueve una transacción existente a programada, reutilizando el patrón de arquitectura del botón `Repetir` que ya existe (sección 2.2).
8. Los programados **se materializan como partidas del mes** vía el rollover. Además, un **gasto con cuenta de origen puede ejecutarse solo** en su fecha (sección 4.6), y en ese caso **valida que Telegram esté habilitado** antes de mover dinero (sección 7.4).
9. Los datos siguen acotados por `userId` del token en el backend, como todo el API. Con un solo usuario es defensa en profundidad, no una frontera activa.

---

## 2. Estado actual verificado (leer antes de tocar)

| Hecho | Evidencia |
|---|---|
| El gasto del presupuesto sale **solo de transacciones ejecutadas**: `type='expense' AND transfer_group_id IS NULL` | `GastosApp.BusinessLogic/Services/Budgets/BudgetService.cs:296-306` y `:313-335` |
| El presupuesto es **solo gasto**: el scope debe ser categoría/subcategoría `type='expense'` | `BudgetService.cs:437-440`, `:457-460` |
| `budgets` es XOR categoría/subcategoría, y **no tiene columna de tipo** | `SQL/schema.sql:468-491` (`ck_budgets_scope`) |
| **No existe copiar/clonar a otro mes**; el periodo es inmutable | `BudgetService.cs:120-124` (`"periodKey cannot be changed."`), sin `clone` en `IBudgetService` |
| **No existe eliminar presupuesto** | Sin `HttpDelete` en `GastosApp.API/Controllers/BudgetsController.cs`; solo `PATCH /api/budgets/{id}/active` |
| Borrado **duro** está bloqueado por la base | `alert_deliveries.budget_id` → `ON DELETE RESTRICT` (`SQL/schema.sql:519-548`) |
| **No existe** ninguna tabla/recurso de partidas recurrentes o planificadas | `grep -iE "Recurr|Scheduled|Planned|Recurrente|Fijo"` en `GastosApp.Models/Entities/` → 0 resultados |
| La alerta actual **nunca dispara por "no ejecutado"** | `AlertEvaluationService.cs:64` → `continue` si `status.Spent <= 0m` |
| Idempotencia de alertas: `UNIQUE (budget_id, threshold_id, period_key)` + CTE `INSERT … ON CONFLICT DO NOTHING` que encola el outbox en la misma sentencia | `SQL/schema.sql:519-548`, `GastosApp.BusinessLogic/Services/Infrastructure/Repository.cs:206-233` |
| El drenador de outbox **es agnóstico al payload**: lee `Status`/`NextAttemptAt` y manda `item.Payload` | `GastosApp.API/BackgroundServices/AlertDispatchBackgroundService.cs:96-113` |
| Evaluación: `AlertEvaluationBackgroundService`, cada `EvaluationIntervalMinutes` (default 60), sin `PeriodicTimer`, alcance **un solo usuario** (`TelegramOptions.AppUserId`) | `AlertEvaluationBackgroundService.cs:42-81`, `Configuration/AlertsOptions.cs:12` |
| Proyección existente = OLS sobre **net global**, 6 meses; **no hay promedio por categoría** | `Services/Dashboard/DashboardService.cs:169-329`, `HistoricalMonths = 6`, `MinTrendSampleMonths = 3` |
| UI: periodo es un `<input type="month">` sin navegación relativa; el menú por fila ofrece **solo** Editar y Activar/Desactivar | `app/(app)/budgets/_components/budgets-toolbar.tsx:48-54`, `_components/budget-actions-menu.tsx:21-41` |
| Hooks disponibles: `create`, `update`, `toggleActive` — nada más | `_hooks/use-budgets-admin.ts:122-134` |
| Zona horaria y rango de mes centralizados | `Services/Dashboard/MonthRangeResolver.cs` (`America/Mexico_City`, rango UTC semiabierto) |
| `categories.type` admite `income` / `expense` / `transfer` | `SQL/schema.sql:70` |
| **Sin proyectos de test** en el repo | no existe `*Tests*.csproj` |

### 2.1 Consecuencias directas (esto define el diseño)

1. **"Que cuente aunque no se ejecute" cambia la semántica de `spent`.** No es un ajuste cosmético: hay que separar *ejecutado* de *comprometido* y decidir cuál manda en el porcentaje.
2. **Los ingresos no caben en `budgets`.** La tabla es gasto por XOR de scope. Los ingresos planificados necesitan estructura y servicio nuevos.
3. **El "copiado" que crees que existe hoy no existe.** Hay que construirlo, y hay que decidir si es copia literal o remonte.
4. **El borrado duro no se puede implementar** sin cambiar `ON DELETE RESTRICT` en `alert_deliveries`. Soft-delete es la salida barata.

### 2.2 Hallazgos sobre el botón "recurrente" y el catálogo (Parte B)

| Hecho | Evidencia |
|---|---|
| **El botón `Repetir` YA EXISTE** en el histórico, como botón inline (no dropdown) en la columna `id: "actions"`, solo para `income`/`expense` | `app/(app)/transactions/_hooks/use-history-columns.tsx:162-166` |
| Pero es **one-shot**: `buildRepeatPrefill` **no copia la fecha**, solo `kind`, `accountId`, `categoryId`, `subcategoryId`, `merchantId`, `amount`, `description`, `tagsText`, `allocations` | `app/(app)/transactions/_lib/transactions-repeat.ts:10-35` |
| La fecha la pone el default del formulario = **hoy** | `_shared/transactions-screen-shared.ts:21-27` (`buildIncomeScreenDefaults`) |
| El `Repetir` navega con query param `?repeat=<json>` a `/transactions/income` \| `/transactions/expense` | `transactions-repeat.ts:8,37-39`; `history-client.tsx:169-174`; `income/page.tsx:10`, `expense/page.tsx:10` |
| **Existe test** de esa lógica | `_lib/transactions-repeat.test.ts` (en la lista de `package.json`) |
| **Toda la UI está detrás de admin** (verificado) | `app/(app)/layout.tsx` → `requireAdminSession()` en el **layout**, así que **ninguna** pantalla es accesible a un no-admin. Además cada página repite el check: `requireAdminSession()` en `budgets/page.tsx` y `dashboard/page.tsx`; `getServerSession` + check de rol en `accounts/page.tsx`, `catalogs/*/page.tsx`, `users/page.tsx`. **Corrección:** `transactions-route-guard.ts` → `requireTransactionsSession()` **también exige admin** (`role !== "admin"` → `redirect("/dashboard")`); la afirmación previa de que el histórico era accesible a no-admin era **falsa** |
| **Los BFF no aplican check de rol** (verificado) | Los 47 `app/api/bff/**/route.ts` solo hacen `getServerSession()` + `unauthorized()`; **ninguno** verifica rol, ni siquiera `app/api/bff/budgets/route.ts`. El control de rol es exclusivamente de página |
| **El API exige JWT con `userId`, no rol admin** (verificado) | `BudgetsController.cs:12`, `TransactionsController.cs:13`, `MerchantsController.cs:11` usan `[Authorize(Policy = "UserWithId")]`. Solo `UsersController.cs:12` usa `AdminWithId`. Es decir: **un no-admin con JWT puede llamar a `/api/*` aunque no vea ninguna pantalla.** La política es de autenticación y propiedad, no de rol |
| Patrón de catálogo más simple a clonar = `merchants` (3 archivos, sin endpoint `search` extra) | `catalogs/merchants/{page,merchants-client,merchants-section}.tsx`; BFF en 3 archivos `route.ts` (GET/POST), `[id]/route.ts` (PUT), `[id]/active/route.ts` (PATCH con body boolean plano) |
| Compartidos de catálogo listos para reutilizar | `catalogs/_shared/`: `CatalogSingleScreenClient`, `useCatalogSectionState`, `SectionFilterBar`, `CatalogActionButton` (`create\|edit\|deactivate\|activate`), `StatusBadge`, `useCatalogToasts`, `CatalogToastStack`, `requestJson`, `CATALOGS_MODULE_TEMPLATE` |
| Acciones por fila = columna literal `id: "actions"` (sticky por default) | `components/data-grid/data-grid.tsx:22-47`, `:305` |
| `nav-config.ts` acepta `children` sin icono; iconos solo en nivel raíz | `components/navigation/nav-config.ts:15-43` |
| Categorías por tipo: ruta dedicada `GET /api/categories/type/{type}` (`income\|expense\|transfer`), **sin** query param `?type=` | `GastosApp.API/Controllers/CategoriesController.cs:69-92`, `AllowedTypes` `:14-19` |
| El frontend agrupa por tipo **en cliente**, no filtra en API | `app/api/bff/transactions/catalogs/route.ts:64-68` (`categoriesByType.income/expense/transfer`) |

**Conclusión que ordena toda la Parte B:** lo pedido son **dos features distintas** que el nombre confunde. `Repetir` (one-shot, sin fecha) **ya existe**; lo que no existe es **periodicidad**. La Parte B agrega la periodicidad y hace que el botón del histórico sea una puerta de entrada a ella, reutilizando el **patrón de arquitectura** (helper puro en `_lib/` + test propio), no el transporte `?repeat=`.

**Y una realidad de permisos que hay que decir sin adornos:** hoy **toda la aplicación es admin-only**, no solo Presupuestos y Catálogos. Un usuario no-admin que entra no llega ni al dashboard. Por eso "que cualquier usuario pueda crear programadas" **no es configurar un guard**: es abrir el grupo `(app)` a no-admin, y eso hay que hacerlo con cuidado porque toca el layout que hoy protege todo. La decisión es legítima, pero su costo real es ese, no el href del menú.

### 2.3 Decisiones cerradas del usuario

**Decisión 0 — ubicación y permisos (Parte B).** Revisada por el usuario tres veces, y aquí está la **vigente**:

- Propuesta inicial: el catálogo vive en `Catálogos` y además se puede programar desde el histórico.
- Segunda: "que no sea admin las programadas y que cualquier usuario pueda crearlo".
- **Tercera y vigente:** al comprobar que **hoy nada es accesible a un no-admin** (`app/(app)/layout.tsx` aplica `requireAdminSession()` al grupo completo), el usuario decidió **dejarlo así: todo admin**. La pantalla de programadas **vuelve a `Catálogos`** y hereda el guard de admin que ya tiene todo el resto.

**Consecuencia:** esta decisión **elimina** el cambio de mayor riesgo de la fase. No se toca el layout `(app)`, no se reparten guards entre 18 páginas y no hay checklist de regresión de permisos (criterio 44 lo deja explícito: el layout no se toca). El backend sigue con `[Authorize(Policy = "UserWithId")]` igual que todo el API, y la propiedad se valida por `userId` (`ICurrentUserService`), nunca por rol.

**Consecuencia secundaria, también buena:** el botón `Programar` del histórico **sí** queda disponible, porque el histórico es admin-only como todo lo demás (`requireTransactionsSession()` exige admin). La asimetría de conveniencia que preocupaba deja de existir.

**Decisión 1 — caducidad.** Partida planificada sin ejecutar: **caduca a fin de mes y deja de contar**. Cierra el periodo, la partida se reporta como *no ejecutada* (desviación), y para el mes siguiente se crea de nuevo vía rollover. Esto evita que el comprometido crezca sin límite y hace que un mes cerrado nunca quede inflado con fantasmas.

**Decisión 2 — el número y su desglose.** `effective = spent + committed` **alimenta el porcentaje** que manda (barra, umbrales, alertas). Pero `spent` y `committed` **se muestran diferenciados**: el usuario debe poder ver de un golpe de vista cuánto ya gastó y cuánto tiene planificado encima. No se funden en un solo número opaco.

`projected` **queda fuera del número por default** (es estimación no confirmada), pero se muestra como marca tenue cuando el toggle está activo.

Consecuencia de diseño: `percentUsed` deja de ser un solo número y se convierte en un **desglose** (`spentPercent`, `committedPercent`, `projectedPercent`, `percentUsed` efectivo). Ver sección 4.2 y sección 5.

### 2.4 Decisión de rollover adoptada (`copy-on-open` + remonte)

| Alternativa | Veredicto |
|---|---|
| Copia literal de todo al mes siguiente | ❌ Los recurrentes se duplicarían al remontar (colisión con `UX (user, period, scope)`) |
| Solo remontar recurrentes (template) | ❌ Pierdes los ajustes manuales y la capacidad de editar "solo este mes" |
| **Híbrido `copy-on-open`** | ✅ **Adoptado** |
| Rollover automático (job) | ❌ Crea filas que el usuario no pidió y no puede revisar |

**Híbrido adoptado, explícito y con opt-in:**

- **Regla primaria (sin sorpresas):** "abrir" un mes sin presupuestos te ofrece **clonar el mes anterior**. Es una acción explícita del usuario (`POST /api/budgets/rollover`), nunca un job silencioso.
- **Remonte de recurrentes:** al clonar, las partidas `source='template'` se **regeneran desde su recurrencia** (fecha recalculada al mes destino), no se copian literalmente → sin duplicados ni colisión de scope.
- **Ajustes por mes:** las partidas `source='manual'` sí se copian con su monto ajustado a mano.
- Idempotencia: `UX (user_id, period_key, kind, name)` en `budget_items` + `ON CONFLICT DO NOTHING`. Clonar dos veces el mismo mes no duplica.

### 2.5 Decisión de borrado adoptada

Las partidas usan **soft-delete unificado** (`cancelled`), no borrado duro. Motivo: la partida es la traza que sostiene tus números; borrarla reescribe la historia de un mes cerrado. Ofrece un endpoint de purga **solo para periodos abiertos** si necesitas limpiar ruido.

**`executed` es un estado terminal (decisión cerrada).** Una partida `executed` tiene una transacción enlazada y ambas cosas se sostienen mutuamente (`ck_budget_items_executed`). En consecuencia:

- `PATCH /api/budget-items/{id}/status` a `pending` o `ignored` sobre una partida ejecutada devuelve **409** (`BudgetConflictException`), no 500. `executed` a `executed` es un no-op permitido.
- `POST /api/budget-items/{id}/cancel` sobre una partida ejecutada devuelve **409**.
- `PUT /api/budget-items/{id}` que mueva `plannedDate` a **otro mes** sobre una partida ejecutada devuelve **409**; cambiar la fecha dentro del mismo mes sigue permitido.

**El camino de reversa es borrar la transacción enlazada**: el trigger `trg_budget_items_release_on_transaction_delete` resetea la partida a `pending`, suelta el enlace y el monto desaparece de `spent`. Por qué no se resuelve soltando el enlace y dejando el estado nuevo: `spent` viene de `transactions` y `committed` de las partidas `pending`/`ignored`, así que una partida `pending` con su transacción viva contaría en ambos, y `effective = spent + committed` — el número que decide los umbrales de alerta — contaría el mismo dinero dos veces. Mover de mes una partida ejecutada tiene el mismo problema de traza: el mes viejo pierde su `plannedAmount`/`variance` mientras el gasto sigue contando en `spent` de ese mes, y el mes nuevo recibe una partida cuya transacción vive en otro periodo.

Los presupuestos usan `active=false` (soft) y, adicionalmente, **`DELETE /api/budgets/{id}` con guardia**: 409 si el mes ya cerró, si el presupuesto tiene partidas `executed`, o si tiene entregas de alerta. El plan documenta las tres condiciones y no promete borrado duro irrestricto, porque la base no lo permite.

---

## 3. Modelo de datos

Tres tablas nuevas y una migración mínima sobre `alert_outbox`.

**Orden de creación obligatorio** (hay FKs cruzadas): `recurring_items` → `budget_items` → `budget_item_alert_deliveries` → alteraciones de `alert_outbox` → alteración de `transactions`. En este documento `budget_items` (sección 3.1) se explica primero por importancia funcional, pero **en el archivo SQL debe crearse después de `recurring_items`**, porque `fk_budget_items_recurring_item` la referencia. Aplicar el DDL en el orden equivocado falla en instalaciones nuevas.

### 3.1 `budget_items` — la partida planificada (el corazón de la fase)

```sql
CREATE TABLE IF NOT EXISTS budget_items (
    item_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    period_key CHAR(7) NOT NULL,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('income', 'expense')),
    name VARCHAR(120) NOT NULL,
    planned_amount DECIMAL(15, 2) NOT NULL CHECK (planned_amount > 0),
    planned_date DATE NOT NULL,
    category_id INT,
    subcategory_id INT,
    account_id INT,
    merchant_id INT,
    recurring_item_id INT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'executed', 'ignored', 'cancelled')),
    is_projected BOOLEAN NOT NULL DEFAULT FALSE,
    transaction_id INT,
    source VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'template')),
    notes VARCHAR(300),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_budget_items_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_budget_items_category
        FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT fk_budget_items_subcategory
        FOREIGN KEY (subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE RESTRICT,
    CONSTRAINT fk_budget_items_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_budget_items_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE RESTRICT,
    CONSTRAINT fk_budget_items_recurring_item
        FOREIGN KEY (recurring_item_id) REFERENCES recurring_items(recurring_item_id) ON DELETE SET NULL,
    CONSTRAINT fk_budget_items_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE SET NULL,
    CONSTRAINT ck_budget_items_period_key
        CHECK (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT ck_budget_items_scope
        CHECK ((category_id IS NULL) <> (subcategory_id IS NULL)),
    -- Un gasto puede presupuestarse por subcategoría; un ingreso no (no existe subcategoría de ingreso en la práctica).
    CONSTRAINT ck_budget_items_income_scope
        CHECK (kind = 'expense' OR subcategory_id IS NULL),
    -- executed y transaction_id se sostienen mutuamente.
    CONSTRAINT ck_budget_items_executed
        CHECK ((status = 'executed' AND transaction_id IS NOT NULL)
            OR (status <> 'executed' AND transaction_id IS NULL))
);

-- Remontar un mes no puede duplicar la misma partida.
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_items_user_period_kind_name
    ON budget_items(user_id, period_key, kind, name);

-- Una transacción satisface como máximo UNA partida: mata el doble conteo y hace idempotente el enlace.
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_items_transaction
    ON budget_items(transaction_id) WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_items_user_period_status
    ON budget_items(user_id, period_key, status);

CREATE INDEX IF NOT EXISTS idx_budget_items_user_status_date
    ON budget_items(user_id, status, planned_date);
```

Notas de diseño:

- `category_id` / `subcategory_id`: **XOR, igual que `budgets`**. Se valida contra el `type` de la categoría (`income` para `kind='income'`, `expense` para `kind='expense'`).
- `account_id` **nullable**: una partida de ingreso puede no tener cuenta asignada todavía ("me van a pagar"). Si se asigna, alimenta el flujo proyectado de esa cuenta.
- `is_projected=true` marca la **cuota derivada de una recurrencia** (`amount_mode='average'`) que **no** fue confirmada este mes. Es el único desglose que no compromete dinero (ver sección 4.5).
- `transaction_id` enlaza con la transacción que la cumplió. `ON DELETE SET NULL` + el chequeo `ck_budget_items_executed` obligarían a un `status` coherente si se borra la transacción: la implementación resetea `status='pending'` en la misma transacción SQL antes del borrado. **Pendiente de verificación en implementación** (ver sección 14).

### 3.2 `recurring_items` — la plantilla de lo que se repite

```sql
CREATE TABLE IF NOT EXISTS recurring_items (
    recurring_item_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('income', 'expense')),
    name VARCHAR(120) NOT NULL,
    amount_mode VARCHAR(20) NOT NULL DEFAULT 'fixed'
        CHECK (amount_mode IN ('fixed', 'average')),
    amount_mxn DECIMAL(15, 2) CHECK (amount_mxn IS NULL OR amount_mxn > 0),
    day_of_month INT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    category_id INT,
    subcategory_id INT,
    account_id INT,
    merchant_id INT,
    starts_period CHAR(7) NOT NULL,
    ends_period CHAR(7),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    auto_execute BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_recurring_items_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_recurring_items_category
        FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT fk_recurring_items_subcategory
        FOREIGN KEY (subcategory_id) REFERENCES subcategories(subcategory_id) ON DELETE RESTRICT,
    CONSTRAINT fk_recurring_items_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_recurring_items_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE RESTRICT,
    CONSTRAINT ck_recurring_items_starts
        CHECK (starts_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT ck_recurring_items_ends
        CHECK (ends_period IS NULL OR ends_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT ck_recurring_items_scope
        CHECK ((category_id IS NULL) <> (subcategory_id IS NULL)),
    CONSTRAINT ck_recurring_items_income_scope
        CHECK (kind = 'expense' OR subcategory_id IS NULL),
    CONSTRAINT ck_recurring_items_fixed_amount
        CHECK (amount_mode <> 'fixed' OR amount_mxn IS NOT NULL),
    CONSTRAINT ck_recurring_items_window
        CHECK (ends_period IS NULL OR ends_period >= starts_period)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_items_user_kind_name
    ON recurring_items(user_id, kind, name);
```

- `auto_execute` **default FALSE**, y en v1 **solo se permite `TRUE` para `kind='expense'` con `account_id` no nulo** (sección 4.6). Motivo: materializar un ingreso que no llegó es doble contabilidad optimista, no un ingreso. Se valida en servicio, no en la base.
- `amount_mode='average'`: el monto se deriva del **promedio de los últimos N meses ejecutados** (sección 4.5). `amount_mxn` queda `NULL` para estas.
- **`effective_from DATE` (nullable): la fecha en que la programada entra en vigor, decidida a mano** (sección 4.8). `NULL` significa "sin forzar": rige `starts_period`. Debe estar dentro del mes de `starts_period` o ser posterior; nunca anterior al inicio de ese periodo. Se valida en servicio **y** con un `CHECK` de coherencia con `starts_period` en la migración, porque es una fecha que el usuario escribe a mano y la base no debe aceptar incoherencias.

### 3.3 `budget_item_alert_deliveries` — idempotencia de las alertas de partidas

```sql
CREATE TABLE IF NOT EXISTS budget_item_alert_deliveries (
    delivery_id SERIAL PRIMARY KEY,
    item_id INT NOT NULL,
    user_id INT NOT NULL,
    period_key CHAR(7) NOT NULL,
    alert_kind VARCHAR(20) NOT NULL
        CHECK (alert_kind IN ('due_today', 'overdue', 'unexecuted_month_end')),
    planned_amount DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT fk_budget_item_alert_deliveries_item
        FOREIGN KEY (item_id) REFERENCES budget_items(item_id) ON DELETE CASCADE,
    CONSTRAINT fk_budget_item_alert_deliveries_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT ck_budget_item_alert_deliveries_period_key
        CHECK (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_item_alert_deliveries_kind_period
    ON budget_item_alert_deliveries(item_id, alert_kind, period_key);
```

`ON DELETE CASCADE` desde `item_id`: si la partida desaparece, su historial de alertas ya no significa nada. Coherente con `alert_outbox → alert_deliveries`. `user_id` se guarda como dato de la partida; **no** participa en resolver el destino del envío (sección 6, regla 3).

### 3.4 Migración mínima sobre `alert_outbox` (reutilizar el drenador)

El drenador **ya es genérico** (sección 2): selecciona todo lo `pending` con `NextAttemptAt <= now` y envía `Payload`. Solo falta que la fila pueda apuntar también a un aviso de ejecución automática, no solo a una alerta de presupuesto.

```sql
ALTER TABLE alert_outbox ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'budget';
ALTER TABLE alert_outbox ADD COLUMN IF NOT EXISTS source_id INT;
ALTER TABLE alert_outbox ADD COLUMN IF NOT EXISTS source_key VARCHAR(30);
-- El dueño de la fila. Necesario porque el outbox se lee por usuario (GET /api/alerts/outbox).
ALTER TABLE alert_outbox ADD COLUMN IF NOT EXISTS user_id INT;
UPDATE alert_outbox o
SET user_id = d.user_id
FROM alert_deliveries d
WHERE o.delivery_id = d.delivery_id AND o.user_id IS NULL;
ALTER TABLE alert_outbox ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE alert_outbox DROP CONSTRAINT IF EXISTS fk_alert_outbox_user;
ALTER TABLE alert_outbox ADD CONSTRAINT fk_alert_outbox_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_alert_outbox_user_status
    ON alert_outbox(user_id, status);
ALTER TABLE alert_outbox ALTER COLUMN delivery_id DROP NOT NULL;
ALTER TABLE alert_outbox DROP CONSTRAINT IF EXISTS fk_alert_outbox_delivery;

-- El índice debe incluir source_key y excluir failed. Ver la justificación debajo.
DROP INDEX IF EXISTS uq_alert_outbox_source;
DROP INDEX IF EXISTS uq_alert_outbox_delivery;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_outbox_source
    ON alert_outbox(source_type, source_id, source_key)
    WHERE source_id IS NOT NULL AND status <> 'failed';
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_outbox_delivery
    ON alert_outbox(delivery_id)
    WHERE delivery_id IS NOT NULL AND status <> 'failed';
```

**`user_id`: por qué el outbox necesitaba dueño (fallo detectado en verificación, corregido).** El outbox se lee por usuario: `GET /api/alerts/outbox` y `POST /api/alerts/outbox/{id}/retry` acotan al usuario autenticado. Antes de esta fase el alcance salía de la entrega (`o.Delivery.UserId`). Al volver `delivery_id` nullable, ese camino se rompe: las filas de partida y de ejecución automática no tienen entrega, y un filtro que "tolera null" (`o.Delivery == null || o.Delivery.UserId == appUserId`) **no acota nada** — devuelve las filas sin entrega de **todos** los usuarios. Con secuencia de usuario disponible eso es una **fuga de `payload` y `lastError` ajenos** por un endpoint abierto a cualquier usuario autenticado (la política es `UserWithId`, no admin). `user_id` en la propia fila elimina la ambigüedad: el filtro pasa a ser una igualdad, sin `OR` ni correlación. El `UPDATE` de backfill es necesario para las filas de Fase 2, que ya tienen entrega de la que se deriva el dueño; `SET NOT NULL` es seguro porque hasta esta migración `delivery_id` era `NOT NULL` con FK, así que toda fila existente tiene dueño derivable.

**`source_key`: por qué el índice anterior estaba MAL (corregido en esta revisión).** La primera versión de este plan definía `UNIQUE (source_type, source_id) WHERE source_id IS NOT NULL`. Eso permitía **una sola fila de outbox por partida, para siempre** — y con eso, la idempotencia que sección 6 exige ("una alerta por partida, tipo y periodo") era **imposible de cumplir**:

- Una partida dispara hasta **cuatro** alertas distintas (`committed_due`, `due_today`, `overdue`, `unexecuted_month_end`). Con el índice viejo, la **primera** insertaba y las otras tres se descartaban por `ON CONFLICT DO NOTHING`, sin error y sin log. Cobertura silenciosamente parcial.
- `unexecuted_month_end` se repite **cada periodo** para la misma partida. Con el índice viejo, se enviaba **una vez en la vida de la partida**. La desviación de los meses siguientes no se reportaba nunca.

`source_key` es el discriminador de ocurrencia dentro de la fuente. Valores:

| `source_type` | `source_id` | `source_key` | Significado |
|---|---|---|---|
| `'budget'` | `budget_id` | `period_key` | Sin cambio de comportamiento respecto a Fase 2 (una alerta por presupuesto y periodo) |
| `'budget_item'` | `item_id` | `{period_key}:{alert_kind}` | Una fila por partida, tipo de alerta y periodo. **Es lo que sostiene el requisito del usuario** |
| `'recurring_item'` | `recurring_item_id` | `period_key` | Un aviso por ocurrencia ejecutada (sección 4.6 regla 8) |

**`status <> 'failed'` en los dos índices: por qué también se corrige.** El drenador **expira a `failed`**, no borra (`AlertDispatchBackgroundService.cs:147-153`: `UPDATE alert_outbox SET status = 'failed' ... WHERE status='pending' AND created_at < NOW() - INTERVAL '7 days'`). Sin el predicado de estado, una fila expirada **seguiría ocupando la clave para siempre**: si el drenador estuvo caído más de 7 días (Telegram deshabilitado, o el lote hambriento tras 5 intentos), la fila se marca `failed` y **ningún intento posterior puede volver a insertar**. El aviso se pierde de forma permanente y silenciosa. Con `status <> 'failed'`, una fila expirada libera la clave y el evaluador puede reinsertar cuando la condición siga vigente.

**Esto también tapa un fallo latente de Fase 2**, no solo del camino nuevo: el `uq_alert_outbox_delivery` actual (`ON alert_outbox(delivery_id)`, sin predicado de estado) tiene exactamente el mismo problema. No es una regresión de esta fase; es un endurecimiento que aprovecha la migración.

**Lo que NO cambia:** el candado real de idempotencia del camino de presupuesto sigue siendo `uq_alert_deliveries_budget_threshold_period` sobre `alert_deliveries`, y el del camino nuevo es su propia tabla de reclamo (sección 3.3). El índice del outbox es la segunda barrera, no la primera. Por eso excluir `failed` no puede producir un envío duplicado: la tabla de reclamo sigue bloqueando la re-creación.

**Tradeoff explícito:** se pierde la FK `alert_outbox → alert_deliveries`. Es aceptable porque el outbox es una **cola transitoria** cuyo `payload` ya está congelado como texto: la fila no depende de la entrega para tener sentido, y las filas se expiran a `failed` a los 7 días (`AlertDispatchBackgroundService.cs:146-152`). A cambio, se reutiliza un drenador ya probado en lugar de duplicar el mecanismo de envío, backoff y reintentos.

**Valores de `source_type`:** `'budget'` (comportamiento actual, intacto), `'budget_item'` (alertas de partida, sección 6) y `'recurring_item'` (aviso de ejecución automática, sección 7.4).

Efectos en el código existente que **no** deben olvidarse:

- `AlertOutbox.DeliveryId` pasa a `int?` y la navegación `Delivery` a nullable (`GastosApp.Models/Entities/AlertOutbox.cs:33-35`, `:59-60`). Compila roto hasta que se ajuste.
- `ClaimAlertDeliveryAsync` (`Repository.cs:221-231`) sigue insertando **sin** `source_type`/`source_id`: la columna toma su default `'budget'` y `source_id` queda `NULL`, que el índice parcial excluye. **Pero sí debe pasar a insertar `user_id`**, porque la columna es `NOT NULL`: el método ya recibe `userId`, así que basta con añadirlo a la lista de columnas y al `SELECT` del CTE. Es el único cambio del camino de Fase 2.
- `AlertEvaluationService.ListOutboxAsync` y `RetryFailedAsync` cambian su predicado de alcance a `o.UserId == appUserId`. **No** un `OR` que tolere `Delivery == null`: ese `OR` era una fuga entre usuarios (ver arriba).
- El `SELECT` del drenador no filtra por `source_type`, así que las alertas de partida y el aviso de ejecución automática se drenan **sin cambios** en ese servicio.
- **Idempotencia de la migración:** todas las sentencias deben poder correrse dos veces sin error. `ALTER COLUMN … DROP NOT NULL` no acepta `IF EXISTS`, pero es idempotente por naturaleza (no falla si ya es nullable). Verificar corriéndola dos veces seguidas en sección 11.

### 3.5 Entidades C# y mapeo

Nuevas en `GastosApp.Models/Entities/`: `BudgetItem.cs`, `RecurringItem.cs`, `BudgetItemAlertDelivery.cs`.

Modificado: `AlertOutbox.cs` — propiedades `UserId`, `SourceType`, `SourceId`, `SourceKey`; `DeliveryId` pasa a `int?` y la navegación `Delivery` a nullable, más una navegación `User` obligatoria. **El `int?` no compila solo**: arrastra a los seis consumidores listados abajo, y todos se ajustan en la Fase 3.1, no después (sección 12: "DeliveryId nullable rompe compilación").

Consumidores que rompen y deben ajustarse en la misma fase:

| Archivo | Qué cambia |
|---|---|
| `GastosApp.Models/Entities/AlertOutbox.cs` | `DeliveryId` `int?`; `Delivery` nav nullable; `UserId` + nav `User`; `SourceType`/`SourceId`/`SourceKey` |
| `GastosApp.BusinessLogic/Services/Budgets/AlertEvaluationService.cs` (`ListOutboxAsync`, `RetryFailedAsync`) | El filtro de alcance pasa a `o.UserId == appUserId` (igualdad, sin `OR`); la proyección de `DeliveryId`/`BudgetId`/`PeriodKey` se vuelve nullable |
| `GastosApp.BusinessLogic/Services/Infrastructure/Repository.cs` (`ClaimAlertDeliveryAsync`) | El `INSERT` pasa a incluir `user_id` (columna `NOT NULL`); el método ya recibe `userId` |
| `GastosApp.BusinessLogic/Models/Alerts/AlertModels.cs` (`AlertOutboxListItem`) | `DeliveryId` `int?`, `BudgetId` `int?`, `PeriodKey` `string?` |
| `GastosApp.API/Models/Alerts/AlertResponses.cs` (`AlertOutboxResponse`) | Igual que el modelo de negocio |
| `GastosApp.API/Controllers/AlertsController.cs` (`MapOutbox`) | Mapeo nullable, sin coerción |

El contrato del frontend (`GastosApp.Web/lib/contracts/alerts.ts`) **no se toca en esta fase**: ya normaliza con `?? 0`, así que un `DeliveryId` nulo se lee como `0`. Hoy ningún aviso no-presupuesto existe, así que no hay cambio visible. Se revisa cuando haya avisos de programados (Fase 3.4/3.5).
Modificado: `Transaction.cs` — propiedades `Origin` (`string`) y `OriginRecurringItemId` (`int?`) + navegación opcional, por la ejecución automática de sección 4.6.
Modificado: `ContextSqlGastos.cs` — 3 `DbSet` nuevos y sus mapeos, con la misma convención que `budgets`/`alert_deliveries` (`GastosApp.BusinessLogic/Context/ContextSqlGastos.cs:325-381`), más el mapeo de las dos columnas nuevas de `transactions`.
Modificado: `GastosApp.Models/Entities/Budget.cs` — navegación `ICollection<BudgetItem>` solo si hace falta; **no se agrega FK** porque la relación es por `period_key` + scope, no por id.

---

## 4. Semántica: qué cuenta y qué no

Esta sección es el contrato funcional. Si algo se implementa distinto a esto, el presupuesto miente.

### 4.1 Tres conceptos que hoy son uno

| Concepto | Definición | En el porcentaje |
|---|---|---|
| `spent` | Transacciones ejecutadas del scope en el periodo. **Semántica actual intacta.** | ✅ |
| `committed` | Partidas `pending` del scope en un periodo **abierto**, no vencidas. | ✅ |
| `projected` | Cuotas `is_projected=true` (`amount_mode='average'`) y recurrentes no confirmadas. | ⚠️ **Solo si el toggle está activo.** Default: fuera |

```
effective = spent + committed        ← el número que manda en el porcentaje
forecast  = effective + projected    ← marca tenue, solo si el toggle está activo
```

### 4.2 El desglose es obligatorio, no un extra

Decisión del usuario: **el número se compone de `spent + committed`, y ambos se distinguen**. `percentUsed` deja de ser un escalar opaco y pasa a ser un desglose:

| Salida | Qué es | Dónde se pinta |
|---|---|---|
| `spent` / `spentPercent` | Gasto real ejecutado | Segmento sólido, color por `status` |
| `committed` / `committedPercent` | Planificado no ejecutado, periodo abierto | **Segmento rayado** encima del sólido |
| `projected` / `projectedPercent` | Cuotas derivadas de promedio, no confirmadas | Marca tenue (borde punteado), fuera del número si el toggle está apagado |
| `percentUsed` | **`spentPercent + committedPercent`** | El número que decide umbral |
| `remaining` / `effective` | Contra el límite | `remaining = amount − effective` |

Ejemplo: límite $10,000, gastado $6,100, comprometido $1,500.
→ barra sólida a 61%, rayado de 61% a 76%, `percentUsed = 76%`, `remaining = $2,400`.
Con el umbral de 80% activo: **aún sin alerta**, pero la barra ya te está avisando.

Sin esto, un "76%" plano es indecidible: no sabes si gastaste $7,600 o $6,100 con $1,500 de plan. El desglose es exactamente la información que justifica la fase.

**Regla de oro de compatibilidad:** un presupuesto **sin partidas** tiene `committed = 0`, por lo que `effective == spent` y **el comportamiento actual no cambia ni un peso**. Esto es lo que hace segura la migración.

### 4.3 Caducidad: cuándo cuenta y cuándo deja de contar

Ojo: esta decisión aplica al **comprometido** (`committed`), no al gasto ya ejecutado.

- La partida cuenta mientras su `period_key` esté **abierto** (mes corriente o futuro).
- Al cerrar el mes, si sigue `pending`: **deja de contar**, se reporta como `unexecuted`, y el sobrante queda libre.
- Un mes cerrado reporta `spent` real y, por separado, la **desviación** (`planned − executed`) por partida. Nunca se infla con fantasmas.
- **`spent` no caduca nunca**: es la foto real de lo ejecutado y se recalcula igual que hoy para cualquier periodo, pasado o futuro.

### 4.4 Matching: cómo se cumple una partida

Determinista, sin LLM ni heurística difusa:

1. La partida se cumple con una transacción de su **mismo `kind`**, dentro de su **ventana** (`planned_date` → fin de mes) y que coincida, en este orden de fuerza:
   - **Fuerte (auto-match):** `merchant_id` igual **y** monto con tolerancia configurable (`±Plan:MatchTolerancePct`, default `0%` = exacto).
   - **Fuerte:** `account_id` + `category_id`/`subcategory_id` + monto exacto.
   - **Débil (sugerencia, no auto):** misma categoría/subcategoría, mismo mes.
2. Al matchear: `status='executed'`, `transaction_id` = la transacción. El índice único parcial garantiza **una sola** transacción por partida.
3. Si hay **varias** candidatas, se toma la de fecha más cercana a `planned_date`; las demás quedan como gasto normal (no hay doble conteo porque solo una puede enlazarse).
4. **Excepción a la ventana — pago tardío real:** si una transacción matchea una partida `pending` de un mes **ya cerrado**, se enlaza a esa partida y el reporte del mes cerrado se actualiza a `executed`. Sin esto, un pago que se atrasa 3 días rompe el número del mes anterior para siempre. (Es un ajuste de reporte, no de caja.)
5. **Manual:** `PATCH /api/budget-items/{id}/status` con `executed` / `ignored` / `pending` (`cancelled` no se alcanza por aquí: usa `POST /api/budget-items/{id}/cancel`). Sobre una partida `executed` solo se acepta `executed` (no-op): es estado terminal, ver sección 2.5.
6. `ignored` significa "decidí no gastarlo" → **sigue contando** en el comprometido. Solo `cancelled` libera el monto.

### 4.5 Ingresos planificados

- `kind='income'` con `committed` = **monto completo**. Un ingreso que sabes que llega es un hecho esperado, no una estimación.
- `amount_mode='average'` (o una recurrencia con historial irregular) entra como `projected`, **no** como `committed`.
- **Regla conservadora:** `projected` de ingreso = **promedio de los últimos N meses con ingreso efectivamente ejecutado** (default `N = 3`, configurable). Una recurrencia de ingreso con monto declarado fijo (`amount_mode='fixed'`) sí es `committed`, porque el usuario lo afirmó.
- Los ingresos **no** se mezclan en el cálculo de límites de gasto. Se reportan en su propio bloque (`plannedIncome`, `committedIncome`, `projectedIncome`) y alimentan aparte un **flujo proyectado** por cuenta.
- Nada de esto reemplaza al `DashboardService` OLS: aquel sigue siendo la tendencia histórica; esto es el plan declarado. Son dos cosas distintas y ambas se muestran.

### 4.6 Ejecución automática de gastos programados (decisión del usuario)

**Decisión 1-bis (usuario):** el programado **ejecuta solo** únicamente cuando es un **gasto con `account_id` asignado**. Un ingreso, o un gasto **sin** cuenta, solo avisa y espera confirmación manual. Esto vive detrás de `auto_execute` (sección 3.2), que nace en `FALSE`.

**El problema que abre:** `transactions` (`SQL/schema.sql:136-160`) **no tiene ninguna columna de origen**. Una transacción creada por el motor sería indistinguible de una capturada a mano. Sin eso:

- No puedes revisar qué generó el sistema y corregir un error de monto.
- Borrarla no impide que el próximo ciclo la vuelva a crear (bucle).
- Auditar "¿por qué mi saldo cambió solo?" es imposible.

**Solución mínima:** agregar a `transactions` dos columnas nullable, aditivas y sin tocar el flujo actual:

```sql
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (origin IN ('manual', 'auto_recurring')),
    ADD COLUMN IF NOT EXISTS origin_recurring_item_id INT;

ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_origin_recurring_item
        FOREIGN KEY (origin_recurring_item_id) REFERENCES recurring_items(recurring_item_id)
        ON DELETE SET NULL;
```

**Reglas de la ejecución automática:**

1. **Monto:** usa `amount_mxn` de la plantilla, **no** el `planned_amount` de la partida. Si el importe real cambió este mes, el usuario edita la transacción y la partida se reconcilia por el matching normal (sección 4.4).
2. **Fecha:** el día `day_of_month` del mes en curso, **en zona local** vía `MonthRangeResolver`. Si el día no existe en el mes (31 en febrero), se usa el **último día del mes**. Regla explícita, no fallback silencioso.
3. **Origen obligatorio:** `account_id` debe existir y ser del dueño. Si no, la plantilla **no** puede tener `auto_execute=true` → rechazo en creación/edición con 400. La base no puede garantizarlo sola (la cuenta es nullable), así que se valida en `RecurringItemService`.
3-bis. **Salida de Telegram obligatoria (directiva del usuario):** `auto_execute=true` exige que Telegram esté habilitado y configurado. Sin esa salida, la plantilla se **rechaza** con 400 al guardar; y si Telegram se deshabilita después, el motor **no crea** la transacción y deja la partida `pending`. Detalle y tabla de casos en sección 7.4. Razón: una programada que mueve dinero sin poder avisar es invisible.
4. **Idempotencia:** `uq_budget_items_user_period_kind_name` evita dos partidas, y el motor crea la transacción **una sola vez por `(recurring_item_id, period_key)`**. La guardia es la propia partida: si `status='executed'`, no se vuelve a crear. Sin esa guardia, reiniciar el servicio duplicaría gastos.
5. **Borrar la transacción generada** → la partida vuelve a `pending` (misma transacción SQL que sección 3.1) y el motor **la vuelve a crear** en el próximo ciclo, porque la plantilla sigue activa. Esto es **correcto pero sorprendente**: para detenerla hay que desactivar la plantilla. Se documenta en la UI del catálogo, no se "arregla" con magia.
6. **Nunca mueve saldos de un ingreso.** El ingreso no auto-ejecuta en v1 (decisión del usuario). El `projected` de sección 4.5 sigue siendo estimación.
7. **Aviso en la UI:** toda transacción con `origin='auto_recurring'` se distingue visualmente en el histórico y ofrece un atajo "desactivar esta programación", porque el usuario tiene que poder cortar el flujo desde donde lo descubre.
8. **Aviso por Telegram:** cada transacción creada por el motor encola **un** aviso por el outbox generalizado (sección 3.4) con `source_type='recurring_item'`: importe, nombre de la plantilla y fecha. Es la constancia de que el sistema movió dinero; sin él, la ejecución automática sería un cambio de saldo sin explicación. Se envía al destino único existente (`AllowedUserId`), consistente con sección 7.3. El encolado ocurre **después** del commit de la transacción: si el envío falla, el gasto ya es un hecho y el reintento lo maneja el drenador.

**Motor:** un tercer `BackgroundService` que reutiliza la cadencia de `AlertEvaluationBackgroundService` (`:32-60`, `while` + `Task.Delay` con `IHostedService`), registrado junto a los otros dos en `ServiceCollectionExtensions.cs:61-65`. Sin Hangfire, sin Quartz, sin cron — consistente con las exclusiones de sección 13. El ciclo es idempotente y seguro de correr dos veces.

### 4.7 Fecha efectiva manual de una programada (decisión del usuario)

**Directiva:** "que manualmente una programada puedas colocar que sea efectiva antes manualmente". Al crear o editar una programada puedes **fijar a mano desde qué día entra en vigor**, en vez de aceptar el día natural del ciclo.

**Confirmación del usuario sobre el alcance: "sí, solo mes en curso".** Es la frontera dura de este campo: `effective_from` **nunca** puede caer antes del primer día del mes en curso.

**Campo:** `effective_from DATE` (nullable) en `recurring_items` (sección 3.2).

| Caso | Comportamiento |
|---|---|
| `effective_from = NULL` | Sin forzar. La ocurrencia nace en `starts_period` con `day_of_month` |
| `effective_from` dentro del mes de `starts_period`, y ese mes es el **actual** | **La fecha manda sobre `day_of_month`** para ese primer periodo: si pones `2026-10-05` y `day_of_month=15`, la ocurrencia del primer mes es el **5**, no el 15 |
| `effective_from` en un mes **posterior** | Ese mes es el primero. Se prohíbe `effective_from` anterior al inicio de `starts_period` (400) |
| `effective_from` **anterior al primer día del mes en curso** | **400.** No hay backfill de meses pasados ni reescritura de meses ya reportados |

**Por qué la frontera es el mes en curso y no "cualquier pasado":** crear transacciones dentro de un mes cerrado reescribe un presupuesto ya reportado y rompe la caducidad de sección 4.3 (una partida que "caducó" no puede revivir con una transacción retroactiva). Con la frontera en el mes en curso, esa incoherencia es **imposible por construcción**: no hay que detectar "mes cerrado" con una regla aparte (desaparece el pendiente que existía para eso).

**La trampa que esto tiene, y que hay que decir:** si la programada además tiene `auto_execute=true` (sección 4.6), una `effective_from` **anterior a hoy pero dentro del mes en curso** significa que el motor la considera vencida y, en su siguiente ciclo, **creará la transacción con fecha `effective_from`** (retroactiva dentro del mes). Eso es consecuencia de combinar tus dos directivas, pero **no puede pasar en silencio**:

- La transacción se crea con `origin='auto_recurring'` y `transaction_date = effective_from`, visible en el histórico con fecha retroactiva.
- **Regla de contención:** si `effective_from` es anterior a **hoy**, la UI advierte explícitamente antes de guardar ("se registrará un gasto con fecha del 5 de octubre"). No se bloquea, se dice.
- El aviso por Telegram (sección 4.6 regla 8) sale igual, así que el usuario recibe constancia de la transacción retroactiva.
- `effective_from` **no** sustituye a `day_of_month` para los meses siguientes: solo gobierna el arranque. La periodicidad mensual sigue siendo `day_of_month`.

**Por qué importa que el usuario lo decida a mano:** el día natural de compra no siempre es el día en que el cargo aplica. Si pagas la renta el 1 pero la registras el 15, forzar la efectiva evita que el presupuesto la cuente quince días tarde.

### 4.8 Presupuesto con scope por categoría y partidas

El `committed` de un presupuesto **por categoría** incluye las partidas de sus subcategorías; el de un presupuesto **por subcategoría** suma solo la suya. Misma regla que `ResolveSpent` (`BudgetService.cs:341-359`), extendida a partidas. Una partida cuenta en **un solo** presupuesto (el de scope más específico que la contenga); si no cae en ningún presupuesto, se reporta como partida **sin presupuesto** en la UI.

---

## 5. Endpoints

### `BudgetItemsController` — `api/budget-items` (nuevo)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/budget-items?period=yyyy-MM&kind=&status=` | Filtros opcionales; default periodo actual |
| GET | `/api/budget-items/{id}` | |
| POST | `/api/budget-items` | `kind`, `name`, `plannedAmount`, `plannedDate`, scope XOR, `accountId?`, `merchantId?`, `notes?` |
| PUT | `/api/budget-items/{id}` | No permite mover `id`/`userId`; si cambia `plannedDate` a otro periodo, valida disponibilidad e informa |
| POST | `/api/budget-items/{id}/cancel` | Soft-delete. **409 si la partida está `executed`** (ver nota de estado terminal) |
| PATCH | `/api/budget-items/{id}/status` | `executed` / `ignored` / `pending`. **409 si la partida está `executed` y el destino no es `executed`** |
| GET | `/api/budget-items/suggestions?period=yyyy-MM` | Candidatas a match (sugerencias, no escribe) |

### `RecurringItemsController` — `api/recurring-items` (nuevo)

**Guards — precisión importante (verificado).** Este API **no aplica guards de rol**: `[Authorize(Policy = "UserWithId")]` es el patrón de `BudgetsController.cs:12`, `TransactionsController.cs:13`, `MerchantsController.cs:11`; solo `UsersController.cs:12` usa `AdminWithId`. El rol admin se aplica **en la página del frontend**, no en el API. Consecuencia real: hoy un no-admin con JWT **puede** llamar a `/api/budgets` aunque ninguna pantalla se lo muestre. Este controlador lleva `[Authorize(Policy = "UserWithId")]` — igual que el resto — y **no** `AdminWithId`; la propiedad se valida por `userId` vía `ICurrentUserService`. Criterio 36.

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/recurring-items?kind=&active=` | Filtros opcionales. **Siempre acotado al `userId` del token** |
| GET | `/api/recurring-items/{id}` | 404 si no es del usuario |
| POST | `/api/recurring-items` | `kind`, `name`, `amountMode`, `amountMxn?`, `dayOfMonth`, `effectiveFrom?` (nunca antes del mes en curso, sección 4.7), scope XOR, `accountId?`, `merchantId?`, `startsPeriod`, `endsPeriod?`, `autoExecute?` |
| PUT | `/api/recurring-items/{id}` | 404 si no es del usuario |
| PATCH | `/api/recurring-items/{id}/active` | |
| POST | `/api/recurring-items/from-transaction` | **Puerta del histórico.** Body `{ transactionId }`; deriva la plantilla de una transacción existente y devuelve la propuesta. `dryRun` default `true` |
| GET | `/api/recurring-items/config` | **Soporte de sección 7.4:** devuelve `{ autoExecuteAvailable: bool, reason?: string }` leyendo `Telegram:Enabled` + `BotToken`/`AllowedUserId` presentes. La UI deshabilita el checkbox `autoExecute` con explicación en vez de dejar que el usuario choque con un 400. **Nunca** devuelve `chat_id`, token ni credenciales |

`POST /api/recurring-items/from-transaction` sostiene el botón del histórico (sección 8.7). Reglas:

- Solo acepta transacciones `income`/`expense` **del propio usuario** (404 si no es suya o no existe).
- Rechaza `transfer`, `opening_credit` y transacciones con `transferGroupId` → 400 con motivo.
- Deriva `dayOfMonth` del **día local** de `transactionDate` en `America/Mexico_City`, reutilizando `MonthRangeResolver`.
- `startsPeriod` = periodo del **mes siguiente**, no el de la transacción origen: la transacción ya ocurrió, programar su repetición mira hacia adelante. Decisión explícita y visible en el `dryRun`.
- **No** exige rol admin. Lleva `[Authorize(Policy = "UserWithId")]` como todo el API y valida propiedad por `userId` vía `ICurrentUserService`, no por rol.
- Idempotencia: si ya existe una plantilla activa con el mismo `(userId, kind, name)`, devolver 409 con la plantilla existente en el cuerpo, para que la UI ofrezca "ya existe, ¿editar?" en vez de duplicar.
- **No** deriva `effective_from`: la fecha efectiva es una decisión manual del usuario (sección 4.7); el `dryRun` la deja en `NULL` y el drawer la ofrece.

**Validaciones de `effective_from` y `autoExecute` en POST/PUT** (sección 4.7 y sección 7.4):

1. `effective_from` anterior al inicio del mes de `starts_period` → 400.
2. `effective_from` dentro de un **mes ya cerrado** → 400 (no se reescriben meses reportados).
3. `autoExecute=true` con `kind='income'` → 400.
4. `autoExecute=true` con `accountId` nulo → 400.
5. `autoExecute=true` con Telegram deshabilitado o sin configuración → 400 con mensaje accionable ("habilita Telegram para activar la ejecución automática"). Es la directiva sección 7.4: una programada que mueve dinero sin poder avisar no se guarda.

### `BudgetsController` — `api/budgets` (ampliado)

| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/budgets/rollover` | `{ fromPeriod, toPeriod, mode }` con `mode ∈ {copy, remount, copy-and-remount}` (default `copy-and-remount`), `dryRun` default `true`. Devuelve conteos. |
| DELETE | `/api/budget-items/purge?period=yyyy-MM` | Purga **solo** de periodos abiertos (limpieza de ruido) |
| DELETE | `/api/budgets/{id}` | 409 si el mes cerró, si tiene partidas `executed`, o si tiene entregas de alerta |

**Semántica de rollover implementada (`POST /api/budgets/rollover`).** Los tres modos gobiernan **solo las partidas**; los presupuestos se clonan siempre, con sus umbrales. Es una decisión de implementación, no de alcance: el modo existe para responder "qué partidas del mes origen quiero ver en el mes destino", y la respuesta nunca justifica dejar el mes sin presupuesto.

| Modo | Presupuestos | Partidas `manual` | Partidas `template` |
|---|---|---|---|
| `copy` | clona | copia con la fecha recalculada al mes destino | no regenera |
| `remount` | clona | omite | regenera desde su plantilla |
| `copy-and-remount` (default) | clona | copia | regenera |

Otras precisiones que gobiernan la respuesta:

- El cuerpo devuelve **tres bloques de conteos independientes** (`budgets`, `manualItems`, `remountedItems`), cada uno con `attempted`, `inserted`, `skipped` y `omitted`. Invariante: `attempted = inserted + skipped + omitted`. Se separan `skipped` (la clave única ya existía) de `omitted` (monto `average` sin historial ejecutado, no se inventa): un descarte por colisión y un monto que no se pudo derivar son causas distintas y el llamador necesita distinguirlas.
- `dryRun` es el default y **nunca escribe**. Reserva las claves de las partidas manuales que copiaría y las pasa al remonte, de modo que los conteos del `dryRun` coinciden con los de la corrida real en lugar de prometer más de lo que se escribiría.
- El rollover real corre en **una sola transacción SQL**: un error a mitad no deja el mes destino con presupuestos sin partidas.
- Idempotencia: `ON CONFLICT DO NOTHING` sobre `uq_budget_items_user_period_kind_name`. Correr el rollover dos veces para el mismo par de periodos no duplica partidas; la segunda corrida reporta el trabajo previo como `skipped`.
- `toPeriod` debe ser estrictamente posterior a `fromPeriod`; en caso contrario, 400.
- **Implementación:** el endpoint vive en `BudgetsController` pero delega en `IRecurringItemService.RolloverAsync`, no en `IBudgetService`. Motivo: el servicio de programados ya es dueño del materializador y de la clave de idempotencia `(user, period, kind, name)`, y duplicar esa lógica en `BudgetService` crearía una segunda fuente de verdad sobre las mismas filas.

`GET /api/budgets/status` **amplía** su respuesta (aditivo: campos nuevos, ninguno se renombra ni se elimina):

```
spent, spentPercent,
committed, committedPercent,
projected, projectedPercent,
effective,               // spent + committed
percentUsed,             // = spentPercent + committedPercent  (el número que decide umbral)
remaining,               // amount − effective
forecast,                // efectivo + projected — informativo
plannedAmount,           // suma de planned_amount de partidas no canceladas
variance,                // plannedAmount − spent
itemsPending, itemsExecuted, itemsUnexecuted, itemsIgnored,
plannedIncome, committedIncome, projectedIncome
```

**`percentUsed` cambia de significado, no de forma.** Antes era `spent / amount`; ahora es `(spent + committed) / amount`. Para un presupuesto sin partidas el valor es **idéntico** (`committed = 0`). El cambio real es que ahora hay dos porcentajes visibles y uno de ellos compone al otro: el frontend debe pintar el desglose, no el agregado.

**Efecto en umbrales y alertas** (`AlertEvaluationService.cs:69-94`): la selección de umbral usa `status.PercentUsed`, que ahora incluye el comprometido. Esto es **intencional**: que te avise a 80% cuando ya te comprometiste a pagar es el punto de la fase. Pero es un cambio de comportamiento perceptible → nace gobernado por `Alerts:CommittedCountsEnabled`.

**El payload de Telegram se amplía** (`AlertEvaluationService.cs:224-235`). Hoy dice `Gastado: $X de $Y (Z%)`. Con comprometido, eso sería mentira. Nuevo formato:

```
Presupuesto "{name}" · {periodKey}
Gastado:   $6,100.00 de $10,000.00 (61.00%)
Comprometido: $1,500.00 (15.00%)   ← solo si committed > 0
Total:     $7,600.00 (76.00%)
Umbral alcanzado: Aviso (80.00%)
Restante:  $2,400.00
```

Reglas del payload: las líneas de `Comprometido` y `Total` aparecen **solo si hay comprometido**, para no cambiar el mensaje de quienes no usan partidas. Sin nombres de partidas, sin montos por partida: el payload se congela al crear la entrega y no se loguea.


### `PlanController` — `api/plan` (nuevo, resumen del mes)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/plan/summary?period=yyyy-MM` | Vista consolidada: gastos por partida/presupuesto, ingresos planificados, desviaciones, partidas sin presupuesto |

---

## 6. Alertas nuevas

> **DECISIÓN VIGENTE (usuario): "las alertas deben ser destino único y alertas cada gasto programado".**
> Dos cosas separadas, y conviene no confundirlas:
> - **Destino único:** el envío va **siempre** a `Telegram:AllowedUserId`. No se resuelve `chat_id` por dueño, no se toca `ITelegramAlertSender`, no se usa `telegram_identities` (sección 7.3).
> - **Alertas cada gasto programado:** **todo** gasto programado que no se ejecute **avisa**. No es una alerta decorativa para el caso feliz: es la cobertura de fallo.

### 6.1 Cobertura: todo gasto programado avisa, por alguno de los dos caminos

Un gasto programado puede terminar de dos maneras, y **cada una tiene su aviso**. Ninguna termina en silencio:

| Resultado | Aviso | Cuándo |
|---|---|---|
| **Se ejecutó** (automático o manual) | Aviso de ejecución, `source_type='recurring_item'` (sección 4.6 regla 8) | Al crear la transacción, post-commit |
| **No se ejecutó** | `due_today` | El día `planned_date`, si sigue `pending` |
| | `overdue` | Una vez: primer ciclo posterior a `planned_date`, dentro del mes y si sigue `pending` |
| | `unexecuted_month_end` | Último día del mes, si sigue `pending` |

Con esto, el gasto programado del usuario tiene aviso **el día que vence, una vez al quedar atrasado, el último día del mes y el día que se ejecuta**. Ese es el requisito tal como se pidió.

### 6.2 Las tres alertas de partida

Encoladas con el mecanismo existente (sección 3.4), fuente `source_type='budget_item'`:

| `alert_kind` | Cuándo | Texto (sin montos innecesarios) |
|---|---|---|
| `due_today` | `planned_date = hoy` y `status='pending'` | "Hoy vence *{name}*: {amount}" |
| `overdue` | Primer ciclo con `planned_date < hoy`, `status='pending'` y dentro del mes; una vez por partida/periodo | "Sigue sin ejecutarse *{name}*: {amount}" |
| `unexecuted_month_end` | Último día del mes, `status='pending'` | "*{name}* cerró el mes sin ejecutarse: {amount}" |

Aplican a **toda** partida planificada (`kind` gasto o ingreso). No se filtra por `auto_execute`: una plantilla sin auto-ejecución es precisamente la que **más** necesita el aviso, porque nadie la va a ejecutar sola.

**Regla de activación por interruptor, y es un vacío real:** estas alertas nacen detrás de `Alerts:UnexecutedAlertEnabled` (default `false`, sección 6.4). Con el interruptor apagado —que es el estado de entrega— **el requisito del usuario no se cumple**. La fase se entrega con el interruptor apagado por seguridad de despliegue, pero **encenderlo es parte de cerrar la fase**, no un extra posterior. Criterio explícito en sección 10.

### 6.3 Alertas por tipo de gasto programado

No todas las plantillas son iguales, y la cobertura tiene que decirlo:

| Tipo de plantilla | ¿Auto-ejecuta? | Camino de aviso |
|---|---|---|
| Gasto con `auto_execute=true` y cuenta | Sí (sección 4.6) | Aviso de ejecución si funciona; **`due_today`/`overdue`/`unexecuted_month_end` si el motor falló** (cuenta borrada, Telegram deshabilitado después, error) |
| Gasto con `auto_execute=false` | No | Las tres alertas. Es el caso que espera confirmación manual |
| Gasto sin cuenta | No | Las tres alertas |
| Ingreso | No (v1) | Las tres alertas |

**El caso que justifica todo el diseño:** una plantilla con `auto_execute=true` cuya cuenta se borró, o cuyo Telegram se deshabilitó después de guardar (sección 7.4), **no ejecuta y no avisa por el camino de ejecución**. Sin las tres alertas de partida, ese gasto programado se queda mudo: el usuario cree que su renta se pagó sola y el presupuesto no lo muestra ejecutado. Las alertas de partida son la **red de seguridad del motor**, no un adorno encima.

### 6.4 Reglas de diseño

1. **Una fila de outbox por partida, tipo y periodo.** Requiere `source_key = {period_key}:{alert_kind}` en el índice único del outbox (sección 3.4). Sin ese discriminador, la idempotencia que esta sección exige era **imposible** y `unexecuted_month_end` se enviaba una sola vez en la vida de la partida. Es la corrección de mayor impacto de esta revisión.
2. **Generalizar, no duplicar el drenador.** El `AlertDispatchBackgroundService` y su backoff/reintentos se reutilizan tal cual; el evaluador gana un método nuevo para partidas.
3. **Alcance: single-user, sin cambios.** El evaluador de partidas usa el mismo `AppUserId` que el de presupuesto. La tabla `budget_item_alert_deliveries` conserva `user_id` porque el dato viene de la partida, pero **no se usa para resolver destino**: el destino es siempre `AllowedUserId`. Es la razón por la que esta fase no toca `ITelegramAlertSender`.
4. **Interruptor nuevo:** `Alerts:UnexecutedAlertEnabled` (default `false`). Las alertas de partida nacen apagadas. Ver sección 6.2 para la consecuencia de entregar así.
5. **Interruptor del comprometido:** `Alerts:CommittedCountsEnabled` (default `false`). Gobierna si `committed` alimenta el `percentUsed` que dispara umbrales. Con `false`, `percentUsed = spentPercent` y el comportamiento de Fase 2 queda idéntico **aunque existan partidas**. Los **campos** del desglose siempre viajan en la respuesta; el interruptor decide qué compone el umbral, no qué se muestra. El desglose visual en la UI se pinta siempre que haya comprometido.
6. **Sin partida no hay alerta, y eso es un borde.** El evaluador recorre **partidas**; si el rollover no materializó la partida del mes (sección 2.4, copy-on-open), la plantilla activa no produce ninguna alerta. **Requiere verificación** (sección 14): confirmar que abrir la pantalla de Presupuestos materializa el mes, o que existe un camino que lo garantice. Un mes sin materializar es un mes de gastos programados en silencio.
7. **El payload nunca lleva el `chat_id`** ni datos de otras partidas. Con destino único no hay riesgo de enrutamiento, pero el payload sigue siendo dato financiero: no se loguea (sección 7).

## 7. Seguridad

1. Todos los endpoints nuevos bajo `[Authorize(Policy = "UserWithId")]`; `userId` **siempre** de `ICurrentUserService`, nunca del payload.
2. Validar propiedad (o `user_id IS NULL` global) de `category_id`, `subcategory_id`, `account_id`, `merchant_id` antes de persistir, igual que `ValidateScopeAsync` (`BudgetService.cs:419-464`).
3. **Enrutamiento de alertas: destino único, por decisión del usuario.** ("las alertas deben ser destino único"). Elimina el riesgo que esta fase tenía abierto: **no** se abre el evaluador por dueño, **no** se resuelve `chat_id` desde la base y **no** se rompe ninguna invariante. La otra mitad de la decisión —"alertas cada gasto programado"— es cobertura, no enrutamiento, y vive en sección 6.

   - `ITelegramAlertSender` conserva su firma `SendAsync(string text, CancellationToken)` y su comentario: *"El `chat_id` nunca proviene de la base de datos ni del request"* (`ITelegramAlertSender.cs:4-5`). `TelegramAlertSender.cs:38` sigue enviando a `_options.AllowedUserId`.
   - El guard de alcance estricto se mantiene tal cual: `AlertEvaluationBackgroundService.cs:71-81` salta si `TelegramOptions.AppUserId <= 0`. Las alertas de partida usan el mismo evaluador single-user.
   - `Telegram:AllowedUserId` sigue siendo el **único** destino. **Ningún** endpoint acepta `chat_id` como parámetro (criterio 40).
   - **Tradeoff aceptado y explícito:** si algún día entra un segundo usuario, las alertas de sus partidas llegarían al chat del `AllowedUserId` (el dueño actual). Es una fuga de montos entre usuarios y por eso está en sección 13 como exclusión: **el enrutamiento por dueño es requisito previo para un segundo usuario, no un pendiente cosmético.**
   - El `token` y el payload siguen sin loguearse nunca (`TelegramAlertSender.cs:7-9`).

4. **Validar la salida de Telegram en la creación automática (directiva del usuario), con el alcance single-user ya decidido.** El motor de sección 4.6 **no** crea una transacción en silencio: la creación depende de que exista salida de Telegram.

   | Situación | Comportamiento |
   |---|---|
   | `autoExecute=true` **con** Telegram habilitado y configurado | Se guarda. El motor crea la transacción y encola **un** aviso con `source_type='recurring_item'`: importe, nombre de la plantilla, fecha. Sin payload de partida |
   | `autoExecute=true` **sin** Telegram habilitado | **400** al guardar, con mensaje accionable ("habilita Telegram para activar la ejecución automática"). Una programada que mueve dinero sin poder avisar es una programada invisible |
   | Telegram se deshabilita **después** de guardar | El motor **no crea** la transacción; registra el intento y deja la partida `pending`. Degrada a lo seguro |

   **La validación es de configuración, no de identidad:** como el destino es único, basta comprobar `Telegram:Enabled` y que `BotToken`/`AllowedUserId` estén presentes — la misma condición que ya usa `AlertEvaluationBackgroundService.cs:71-81`. No hace falta consultar `telegram_identities` ni un endpoint de estado por usuario. Esto es más simple que la versión anterior del plan y **no** toca el contrato del sender.

   **Qué significa realmente esta validación:** no aísla usuarios (hay uno). Protege contra **que tu propia programada mueva dinero sin avisarte**. Es integridad operativa, no multi-tenant. El helper de verificación se expone al frontend para deshabilitar el checkbox `autoExecute` con explicación, en vez de dejar que el usuario falle con un 400 al guardar.

5. Los `payload` son datos financieros: nunca en logs ni en respuestas de error (regla ya vigente en `AlertOutbox.cs`).
6. Logs: solo ids, estados y conteos. Nunca montos, nombres de partida ni payload.
7. `POST /api/budgets/rollover` es idempotente y con `dryRun` por default; no puede sobrescribir un mes existente.
8. Sin secretos nuevos. Se reutiliza `Telegram:*` y `Alerts:*`.
9. La ejecución automática (sección 4.6) es el punto más sensible de la fase: crea transacciones y mueve saldos. Reglas: `account_id` filtrada por `user_id` de la plantilla en la misma consulta; `origin='auto_recurring'` marcado en la base para auditoría; el motor **nunca** lee `chat_id` ni credenciales; y el logger registra solo `{ErrorType}`, igual que `AlertEvaluationBackgroundService.cs:55-56` (comentario literal: "Solo el tipo: nunca montos, payload ni mensaje de excepción").

---

## 8. Frontend (`GastosApp.Web`)

### 8.1 Navegación de mes (hoy no existe)

Agregar a `budgets-toolbar.tsx` navegación relativa (‹ / mes / ›) junto al `input type="month"`, y **sincronizar el periodo con la URL** (`?period=`), que hoy se lee al inicializar pero no se escribe (`budgets-client.tsx:30-31`).

### 8.2 Pestañas dentro de Presupuestos

`resumen` y `alertas` hoy. Nueva pestaña **Partidas**, con filtro `kind` (`gasto`/`ingreso`) en vez de dos pestañas separadas — menos superficie, un solo CRUD. La pantalla de programadas **no** vive aquí: tiene pantalla propia (sección 8.3).

### 8.3 Catálogo "Programadas" en Catálogos (decisión vigente)

**El usuario revisó la apertura y la revertió:** "si nada es accesible a un admin entonces dejarlo así, todo admin". La pantalla **vuelve a `Catálogos`** y hereda el guard de admin que ya tiene el resto.

**Esto elimina el cambio más riesgoso de la fase:** no se toca `app/(app)/layout.tsx`, no se añade un guard de sesión a `lib/auth/guards.ts`, no se reparten permisos entre 18 páginas y no hay checklist de regresión. La pantalla sigue el patrón de `merchants` tal cual (sección 2.2), con `getServerSession` + check de `role !== "admin"` → `redirect("/dashboard")`.

Archivos:

- `catalogs/recurring-items/page.tsx` — guard admin, igual que `merchants/page.tsx`.
- `catalogs/recurring-items/recurring-items-client.tsx` — `"use client"`, usa `CatalogSingleScreenClient`.
- `catalogs/recurring-items/recurring-items-section.tsx` — `ColumnDef[]`, `DataGrid`, drawer modal, helpers `create`/`update`/`patchActive` con `requestJson`.
- `lib/contracts/recurring-items.ts` — tipo `RecurringItem` + `normalizeRecurringItems` + validador de payload.
- BFF en 3 archivos: `app/api/bff/catalogs/recurring-items/route.ts` (GET/POST), `[id]/route.ts` (PUT), `[id]/active/route.ts` (PATCH). El endpoint `from-transaction` va aparte: `app/api/bff/recurring-items/from-transaction/route.ts`.

Entrada de navegación en `components/navigation/nav-config.ts`, dentro de `Catálogos`:

```ts
{ href: "/catalogs/recurring-items", label: "Programadas" }
```

Columnas de la tabla: `Nombre`, `Tipo` (`Gasto`/`Ingreso`), `Monto`, `Día`, `Efectiva`, `Cuenta`, `Categoría`, `Vigencia`, `Estado` (`StatusBadge`), y columna `id: "actions"` con Editar + Activar/Desactivar.

Campos del drawer: `kind` (select), `name`, `amountMode` (`fixed`/`average`), `amountMxn` (oculto si `average`), `dayOfMonth` (1–31), **`effectiveFrom`** (selector de fecha, sección 4.7, **con mínimo = primer día del mes en curso**), `accountId`, `categoryId` o `subcategoryId` (el scope depende de `kind`; reutiliza la agrupación `categoriesByType` de `app/api/bff/transactions/catalogs/route.ts:64-68`), `merchantId`, `startsPeriod`, `endsPeriod`, `autoExecute` (visible solo si `kind = "expense"`; deshabilitado con explicación si `GET /api/recurring-items/config` dice `autoExecuteAvailable=false`, sección 7.4).

### 8.4 Tabla de partidas

Columnas: `Fecha`, `Partida`, `Scope`, `Planificado`, `Estado`, `Ejecutado`, `Desviación`, acciones.
Estado con semántica visual: `pending` (neutro), `executed` (positivo), `ignored` (atenuado, **sigue contando**), `overdue` (alerta), `cancelled` (tachado).

### 8.5 Barras de presupuesto (desglose visible, decisión del usuario)

`BudgetProgress` (`_components/budget-progress.tsx`) hoy pinta **una sola** capa con `percentUsed` y cierra con `aria-valuetext` "X% del límite". Debe pasar a **dos capas**:

```
[============ sólido (spent) ============][::: rayado (committed) :::]
```

- **Capa 1 (sólida):** `spentPercent`, color por `status` (`budgetMeterClass`), como hoy.
- **Capa 2 (rayada):** de `spentPercent` a `percentUsed`, patrón diagonal con `repeating-linear-gradient`. Debe ser distinguible **sin depender solo del color** (accesibilidad: el color no puede ser el único canal).
- **Marca de proyección:** borde punteado en `forecast`, solo si el toggle está activo.
- `aria-valuenow` sigue siendo `percentUsed`. `aria-valuetext` cambia a algo que declare el desglose: `"61% gastado, 15% comprometido, 76% del límite"`. Un `aria-valuetext` con el agregado pelado pierde exactamente la información que la fase agrega.

**KPIs** (`_components/budgets-kpis.tsx`): hoy el consumo es `totals.spent / totals.budgeted`. Debe componerse igual:

- "Total gastado" → `totals.spent` + línea de apoyo "de $X comprometido".
- KPI nuevo **"Comprometido"** (con el monto y su % del total).
- **"Total restante"** pasa a calcularse contra `effective`, no contra `spent`, porque `remaining` del API ya lo hace así. `totals` en `_lib/budgets-ui.ts` gana `committed` y `effective`.


### 8.6 Acciones

- Menú por fila de presupuesto: agregar **Eliminar** (con guardia 409 explicada en UI) y **Copiar al mes siguiente** (con `dryRun` visible antes de confirmar).
- Menú por fila de partida: Editar, Marcar ejecutada, Ignorar, Cancelar.

### 8.7 Botón "Programar" en el histórico (Parte B)

El histórico **ya** tiene un botón `Repetir` inline en la columna `id: "actions"` (`use-history-columns.tsx:162-166`). La Parte B **no lo reemplaza**: agrega un botón hermano, `Programar`, con una responsabilidad distinta.

| Botón | Qué hace | Reutiliza | Qué cambia |
|---|---|---|---|
| **`Repetir`** (existe) | Precarga el formulario de gasto/ingreso con los mismos datos y lo abre para capturar **ahora** | `?repeat=` + `buildRepeatPrefill` + `parseRepeatPrefill` | Nada. Se deja intacto |
| **`Programar`** (nuevo) | Crea una **plantilla recurrente** a partir de la transacción, para que se repita cada mes | El **patrón de arquitectura** de `Repetir` (helper puro en `_lib/` + test propio) y el endpoint de derivación del backend | Nada del `Repetir` |

**Diferencia deliberada:** `Repetir` usa query param porque **navega** a otra pantalla y necesita sobrevivir al cambio de ruta. `Programar` **no navega**: abre un diálogo en la misma página, así que **no necesita estado en la URL**. Copiar el `?schedule=` sería contrabandear el mecanismo de `Repetir` a un caso que no lo requiere, y agregaría una segunda fuente de verdad sobre un formulario que ya vive en el diálogo. Se reutiliza el patrón, no el transporte.

Diseño del botón nuevo:

- Se agrega en la **misma** celda de acciones, junto a `Repetir`, con la misma condición: `item.type === "income" || item.type === "expense"`. En la práctica ambos botones aparecen juntos para la misma fila.
- **Ojo con la densidad:** esa celda **ya** apila hasta cuatro botones `h-6 text-[10px]` en un `div.flex.gap-1`: `Repetir` (`:161-165`), `Editar` (`:167-169`), `Borrar` (`:170`), `Convertir MSI` (`:171-173`, condicional). Un quinto botón de texto la desborda en pantallas medianas. **Decisión de UI:** `Programar` entra como botón **con icono y sin texto** (`title`/`aria-label` = "Programar recurrente"), o los dos botones de creación (`Repetir` + `Programar`) se agrupan en un menú desplegable. A resolver en Fase 3.5; no cambiar la firma de la celda en 3.3.
- Al hacer clic, **abre un diálogo de confirmación** con lo que se va a crear (nombre propuesto = `description`, tipo, monto, día del mes, cuenta, categoría, `startsPeriod` = mes siguiente). El usuario ajusta y confirma.
- El diálogo arranca con una llamada `dryRun` a `POST /api/recurring-items/from-transaction` para mostrar la propuesta **derivada por el backend**; el usuario ajusta y confirma con `dryRun=false`. La aritmética de derivación (día local, mes siguiente, rechazos) vive en el backend, no se duplica en el cliente.
- **Permiso — sin asimetría que resolver.** El histórico **también** exige admin (`requireTransactionsSession()` hace el check de `role !== "admin"`, verificado en `transactions/_lib/transactions-route-guard.ts`), y el usuario decidió mantener **todo admin**. Así que el botón `Programar` nace admin-only y el catálogo `/catalogs/recurring-items` también: **la misma audiencia, el mismo guard**, sin inconsistencia entre crear y administrar.
- Test: `_lib/transactions-schedule.test.ts` con la lógica pura del diálogo (estado inicial, mapeo de la propuesta al formulario, validación), y **alta obligatoria en la lista explícita de `package.json`** (sección 8.9).

**Por qué no reutilizar el `Repetir` directamente:** `buildRepeatPrefill` **no copia la fecha** (`transactions-repeat.ts:10-35`) y su contrato (`RepeatPrefill`) no tiene periodicidad. Extenderlo obligaría a tocar el flujo de captura de gastos — el camino más sensible del sistema — para una feature que no captura nada. Un botón hermano con su propio endpoint es menos riesgoso y deja intacta la ruta de dinero.

### 8.8 BFF

Rutas nuevas bajo `GastosApp.Web/app/api/bff/budget-items/**`, `.../recurring-items/**`, `.../budget-items/suggestions`, `.../plan/summary`. Mismo patrón que `app/api/bff/budgets/**`.

### 8.9 Tests frontend

El repo **sí** tiene runner: `node --experimental-strip-types --test` con archivos `.test.ts` listados **explícitamente** en `GastosApp.Web/package.json`. Cualquier archivo nuevo de lógica (`plan-model.ts`, `budget-items-model.ts`) debe agregarse a esa lista o no corre. Es un paso fácil de olvidar y por eso está aquí.

---

## 9. Orden de ejecución

### Fase 3.1 — Esquema y entidades (0.5–1 día)

1. `SQL/migrations/2026-09-28_fase3_planned_budget.sql` con el DDL de sección 3, **idempotente**, en el orden obligatorio: `recurring_items` → `budget_items` → `budget_item_alert_deliveries` → `ALTER` de `alert_outbox` → `ALTER` de `transactions` (sección 4.6). Este último va al final porque su FK apunta a `recurring_items`.
2. Réplica idéntica al final de `SQL/schema.sql`.
3. `BudgetItem`, `RecurringItem`, `BudgetItemAlertDelivery` en `GastosApp.Models/Entities/`.
4. Mapeos + `DbSet` en `ContextSqlGastos.cs`; `AlertOutbox` gana `UserId`, `SourceType`, `SourceId`, `SourceKey` y su `DeliveryId` pasa a `int?`.
5. **Ajustar los seis consumidores del `DeliveryId` nullable** (tabla en sección 3.5) y `Transaction.cs` (`Origin`, `OriginRecurringItemId` + navegación). Incluye `ClaimAlertDeliveryAsync`, que debe escribir el `user_id` nuevo. Sin esto la solución no compila.
6. Aplicar a mano y verificar con `\d`. Sin runner automático (verificado en Fase 2).

### Fase 3.2 — Partidas planificadas (1.5–2 días)

1. `IBudgetItemService` + `BudgetItemService` (CRUD, validación de scope por `kind`, cancelación, transición de estado).
2. `GetCommittedAsync` / `GetCommittedByScopeAsync` con `AsNoTracking`, siguiendo el patrón del `SUM` agrupado de `GetSpentByScopeAsync` (`BudgetService.cs:313-335`). Misma regla de scope más específico que `ResolveSpent`, reutilizando el patrón de `ScopeSpend`.
3. `BudgetItemsController` + DTOs.
4. Extender `BudgetStatusResult` con el desglose completo (`spentPercent`, `committed`, `committedPercent`, `projected`, `projectedPercent`, `effective`, `forecast`), manteniendo `committed`/`projected` en cero por default. `BuildStatus` calcula `remaining` contra `effective`.
5. `PlanController` + `api/plan/summary`.

### Fase 3.3 — Programados, materialización y rollover (2–2.5 días)

1. `IRecurringItemService` + `RecurringItemService` (CRUD del catálogo, validación de scope por `kind`, vigencia `starts_period`/`ends_period`, regla de `auto_execute` solo para `expense` **con `account_id`** — rechazo 400 si falta, sección 4.6 regla 3).
2. `IRecurringItemService.CreateFromTransactionAsync` + `POST /api/recurring-items/from-transaction` con `dryRun`, 409 de idempotencia y derivación de `dayOfMonth`/`startsPeriod` (sección 5).
3. Materializador de ocurrencias `(recurring_item_id, period_key)` con `ON CONFLICT DO NOTHING` (misma técnica que `ClaimAlertDeliveryAsync`).
4. `POST /api/budgets/rollover` con `dryRun` y los tres modos (semántica de conteos y dueño del endpoint en sección 5).
5. `amount_mode='average'`: promedio de los últimos N meses ejecutados.
6. `RecurringItemsController`.
7. **`RecurringExecutionBackgroundService`** (sección 4.6): crea la transacción de los gastos con `auto_execute=true` y cuenta válida, con la guardia de idempotencia por partida `status='executed'`, fecha en zona local con regla de último-día-del-mes, y `origin='auto_recurring'`. Registro en `ServiceCollectionExtensions.cs` junto a los otros dos hosted services.
8. **Validación de salida de Telegram** (sección 7.4): helper que comprueba `Telegram:Enabled` + `BotToken`/`AllowedUserId` presentes (sin resolver `chat_id` ni tocar el sender). Se usa en el guardado (400 si no está) y en el motor (no crea si se deshabilitó después). Endpoint `GET /api/recurring-items/config`.
9. **`effective_from`** (sección 4.7): validación de que no sea anterior al primer día del mes en curso ni anterior al inicio de `starts_period`; el materializador lo aplica **solo al primer periodo**.
10. **Aviso de ejecución automática** (sección 4.6 regla 8): encolado **post-commit** en el outbox con `source_type='recurring_item'`.

### Fase 3.4 — Matching y alertas (2–2.5 días)

1. `BudgetItemMatchService`: auto-match fuerte, sugerencias débiles, enlace con el índice único parcial.
2. Hook post-commit en `TransactionCommandService` (try/catch que **nunca** rompe el registro del gasto).
3. Evaluador de partidas + reutilización del outbox generalizado.
4. Extender `AlertsOptions` con `UnexecutedAlertEnabled` y `CommittedCountsEnabled` (ambos `false`).
5. Ampliar `BuildPayload` (`AlertEvaluationService.cs:224-235`) con las líneas condicionales `Comprometido` y `Total`, sin partidas ni montos por partida.
6. **`ITelegramAlertSender` NO se modifica** (sección 7.3): conserva firma y comentario, y sigue enviando a `AllowedUserId`. Las alertas de partida corren con el mismo alcance single-user (`AppUserId`) que las de presupuesto. Verificación: `git diff` vacío en `ITelegramAlertSender.cs`/`TelegramAlertSender.cs` (criterio 45).
7. **Índices del outbox corregidos** (sección 3.4): `source_key` en la clave única y predicado `status <> 'failed'` en ambos índices. **Sin esto, la cobertura de sección 6 no se puede cumplir** — los criterios 47 a 51 fallan. Va en la misma migración que el resto de la Fase 3.1.
8. **Cobertura verificada de punta a punta** (criterios 47–52, matriz 11–19): las tres alertas de partida con sus colisiones, la repetición por periodo, la reinserción tras expiración y el motor fallido que no queda mudo.

### Fase 3.5 — UI y BFF (2.5–3 días)

1. Navegación de mes + sincronización de URL.
2. BFF de partidas, programados, sugerencias y `plan/summary`.
3. Pestaña Partidas con filtro `kind`, tabla, drawer de alta/edición.
4. **Pantalla raíz "Programadas"** (sección 8.3): guard **solo de sesión**; `<name>-client.tsx`, `<name>-section.tsx`, `lib/contracts/recurring-items.ts`, 4 rutas BFF bajo `app/api/bff/recurring-items/`, entrada en `nav-config.ts` como item **raíz**.
5. **`app/(app)/layout.tsx` y `lib/auth/guards.ts` no se tocan** (sección 8.3). El catálogo hereda el guard admin existente. No hay paso de permisos en esta fase.
6. **Botón `Programar` en el histórico**, hermano del `Repetir` existente: `_lib/transactions-schedule.ts` (`buildSchedulePrefill`/`parseSchedulePrefill`, calcado de `transactions-repeat.ts`) + diálogo de confirmación con el `dryRun` del backend.
7. **`BudgetProgress` a dos capas** (sólido `spent` + rayado `committed` + marca de proyección), con patrón distinguible sin depender del color y `aria-valuetext` con el desglose.
8. KPIs: `committed` y `effective` en `_lib/budgets-ui.ts`, KPI nuevo "Comprometido", "Total restante" contra `effective`.
9. Acciones: Eliminar presupuesto y Copiar al mes siguiente.
10. Tests frontend de la lógica nueva (`plan-model`, `budget-items-model`, `recurring-items-model`, `transactions-schedule`, composición del desglose) + alta en la lista explícita de `package.json` (sección 8.9).

### Fase 3.6 — Validación y endurecimiento (1 día)

1. Matriz de sección 10 completa.
2. Verificar que la matriz de Fase 2 **sigue pasando** con `CommittedCountsEnabled=false` (no regresión).
3. Rollback documentado: el esquema nuevo **es aditivo**, así que apagar los dos interruptores devuelve el comportamiento de Fase 2. Pero hay **dos alteraciones no reversibles por interruptor**: el `ALTER` de `alert_outbox` (sección 3.4) y el de `transactions` (sección 4.6). Ninguna de las dos rompe datos (ambas son aditivas con default), pero "apagar y listo" es falso: hace falta una ruta de reversa escrita (sección 14, pendiente 9).
4. **Apagar `auto_execute` es el verdadero interruptor de emergencia** del motor automático: verificar que el flag se consulta en el momento de ejecutar (pendiente 10) y que apagarlo detiene la creación de transacciones en el siguiente ciclo.

**Total estimado: 9.5–12.5 días.** Cada fase es entregable y verificable por separado. Los reverts de permisos y de enrutamiento quitaron trabajo (no se abre el layout `(app)`, no se verifican 18 páginas, no se resuelve `chat_id` por dueño, `effective_from` acotado al mes en curso); pero la cobertura de alertas por gasto programado lo devuelve: el índice del outbox con `source_key` y estado, la red de seguridad del motor fallido y la verificación de punta a punta de las tres alertas son trabajo real. Fase 3.4 sube a 2–2.5 días por eso.

---

## 10. Criterios de aceptación

### Funcionales

1. Un presupuesto **sin partidas** reporta el mismo `spent`, `percentUsed`, `status` y `remaining` que hoy, con `committed = 0` y `effective == spent`.
2. Partida de gasto de $1,500 con fecha 10 del mes, sin transacción → `committed = 1500`, `committedPercent` reflejado, y `percentUsed = spentPercent + committedPercent`.
3. Ese desglose es **distinguible en la UI**: barra sólida hasta `spentPercent` + segmento rayado hasta `percentUsed`, y `aria-valuetext` que declare ambos (no solo el agregado).
4. Una partida caduca al cerrar el mes sin ejecutarse: deja de contar, se reporta `unexecuted`, y el sobrante queda libre.
5. Registrar la transacción que la cumple → `status='executed'`, `transaction_id` asignado, `committed` baja y `spent` sube en el mismo monto, `effective` **no** cuenta dos veces.
6. Segunda transacción candidata no puede enlazarse a la misma partida (índice único parcial).
7. Un ingreso planificado de $12,000 entra como `committedIncome = 12,000` y **no** altera ningún límite de gasto.
8. Una recurrencia de ingreso con `amount_mode='average'` entra como `projectedIncome`, nunca como `committed`.
9. Recurrente de gasto **sin** `auto_execute=true` **no** crea ninguna transacción al remontar.
10. `POST /api/budgets/rollover` con `dryRun=true` devuelve conteos y **0 filas escritas**.
11. Ejecutar el rollover dos veces para el mismo mes no duplica partidas.
12. `DELETE /api/budgets/{id}` sobre mes cerrado → 409 con motivo explícito.
13. `PATCH` a `ignored` mantiene el monto en el comprometido; `cancelled` lo libera.
14. Un pago 3 días tardío enlaza la partida del mes cerrado y el reporte de ese mes pasa a `executed`.
15. El payload de Telegram con comprometido > 0 incluye las líneas `Comprometido` y `Total`; con comprometido = 0 el mensaje es **idéntico** al de Fase 2.

### Parte B — Programados y botón del histórico

16. El botón `Repetir` existente **sigue funcionando igual** (mismo `?repeat=`, mismo test verde). La Parte B no lo modifica.
17. `POST /api/recurring-items/from-transaction` con `dryRun=true` no escribe nada y devuelve la propuesta (nombre, tipo, monto, día, cuenta, categoría, `startsPeriod` = mes siguiente).
18. Ese endpoint **rechaza** `transfer`, `opening_credit` y transacciones con `transferGroupId` → 400 con motivo.
19. Una transacción de **otro usuario** → 404 (nunca 403 con datos).
20. El endpoint `from-transaction` **no exige rol admin** (`UserWithId`, como todo el API): un usuario con JWT válido lo puede invocar aunque la **pantalla** del histórico esté reservada a admin. Un usuario sin JWT → 401. **Matiz explícito:** el botón del histórico es admin-only por la página (`requireTransactionsSession`), no por el endpoint.
21. Programar dos veces la misma transacción → 409 con la plantilla existente en el cuerpo; no se duplica.
22. Al abrir el mes siguiente, la plantilla activa genera **una** partida (no dos al repetir el rollover).
23. `/catalogs/recurring-items` es **inaccesible a un usuario no-admin** (redirect a `/dashboard`, igual que `merchants`), consistente con la decisión "todo admin". Criterio 37 verifica además que los datos están acotados por `userId`.
24. Un gasto con `auto_execute=true` y cuenta válida genera **una sola** transacción en su fecha, con `origin='auto_recurring'` y `origin_recurring_item_id` apuntando a la plantilla.
25. Correr el motor **dos veces** el mismo día no duplica la transacción (la guardia es la partida en `status='executed'`).
26. Una plantilla con `auto_execute=true` y **sin** `account_id` es **rechazada** con 400 al crearse o editarse; nunca llega al motor.
27. Un **ingreso** con `auto_execute=true` es rechazado con 400 (v1 no auto-ejecuta ingresos).
28. `day_of_month=31` en un mes de 30 días ejecuta el **último día del mes**, no el 1 del mes siguiente.
29. Borrar la transacción auto-generada devuelve la partida a `pending` y el motor la **vuelve a crear** en el próximo ciclo mientras la plantilla siga activa (comportamiento documentado, no bug).
30. Ninguna transacción existente cambia: `origin` tiene default `'manual'` y el histórico de antes de la migración queda marcado como manual.
31. **Fecha efectiva manual (sección 4.7):** con `effective_from=2026-10-05` y `day_of_month=15`, la ocurrencia del primer periodo nace el **5**, no el 15; los meses siguientes vuelven al 15.
32. `effective_from` **anterior al primer día del mes en curso** → 400 (sección 4.7). `effective_from` anterior al inicio de `starts_period` → 400.
33. `effective_from` anterior a hoy pero dentro del mes en curso: la UI **advierte** antes de guardar y, con `auto_execute=true`, el motor crea la transacción con `transaction_date = effective_from` (retroactiva y visible dentro del mes), más el aviso por Telegram (sección 4.6 regla 8). No es silencioso.
34. **Validación de salida de Telegram (sección 7.4):** guardar `autoExecute=true` con Telegram deshabilitado o sin configurar → 400 con mensaje accionable. Con Telegram habilitado → 201. Si Telegram se deshabilita después, el motor **no crea** la transacción y deja la partida `pending`.
35. Cuando el motor **sí** crea la transacción, se encola **un** aviso por el outbox con `source_type='recurring_item'` hacia el destino único existente (`AllowedUserId`), con importe, nombre de plantilla y fecha. El encolado es **post-commit**: un fallo de envío no deshace el gasto (criterio que cubre sección 11).

### Seguridad

36. Ningún endpoint nuevo responde 200 sin JWT válido.
37. Usuario B no ve ni modifica partidas, programados, presupuestos ni entregas de A (404/400, nunca 403 con datos).
38. Partida o plantilla con `accountId` de otro usuario → 400.
39. Una transacción de otro usuario no puede convertirse en plantilla del usuario actual (`from-transaction` → 404).
40. **Ningún endpoint acepta `chat_id` como parámetro**, y `ITelegramAlertSender` conserva su firma de un solo argumento. El destino de todo envío es `AllowedUserId`, nunca un valor del request (sección 7.3).
41. `grep` de `BotToken`, `WebhookSecret`, `ApiKey` en logs de la corrida → sin resultados.
42. El evaluador de partidas **no** abre alcance por dueño: corre con el `AppUserId` configurado, igual que el de presupuesto (sección 6 regla 3).
43. El motor de ejecución automática **nunca** usa una `account_id` que no pertenezca a la plantilla ni cruza usuarios: filtra por `user_id` de la plantilla en la misma consulta que la lee.
44. **`app/(app)/layout.tsx` no se toca.** Sigue aplicando `requireAdminSession()` a todo el grupo, y las 18 páginas conservan su check. La decisión "todo admin" no relaja ninguna superficie de autenticación.
45. `ITelegramAlertSender` **conserva su firma y su comentario** ("el `chat_id` nunca proviene de la base de datos ni del request", `ITelegramAlertSender.cs:4-5`): `git diff` de ese archivo vacío al cerrar la fase.
46. `/api/recurring-items` del usuario A nunca devuelve 200 con datos del usuario B: `GET`, `PUT` y `PATCH` sobre ids ajenos → 404. Defensa en profundidad (hoy hay un solo usuario), verificada con un segundo token de prueba.
47. **Cobertura de alertas — el requisito del usuario, verificado de punta a punta.** Para **una** partida de gasto `pending`, en un mes materializado y con `UnexecutedAlertEnabled=true`: el día `planned_date` entra `due_today`; al día siguiente entra `overdue`; el último día del mes entra `unexecuted_month_end`; los tres llegan al **mismo** destino (`AllowedUserId`). **Ninguno se pierde por colisión de índice.**
48. **Idempotencia del outbox por tipo (sección 3.4).** Las tres alertas de la misma partida y el mismo periodo son **tres filas** de `alert_outbox`, no una. Con el índice viejo (`source_type, source_id`) este criterio fallaba silenciosamente: la segunda y la tercera se descartaban por `ON CONFLICT DO NOTHING`.
49. **`unexecuted_month_end` se repite por periodo.** La misma partida en dos meses consecutivos produce **dos** avisos `unexecuted_month_end`, uno por `period_key`. Con el índice viejo solo llegaba el primero en toda la vida de la partida.
50. **Una fila expirada no bloquea el aviso.** Con una fila de `alert_outbox` marcada `failed` por expiración (>7 días), una re-evaluación de la misma condición **vuelve a insertar** y a enviar. Con el índice sin predicado de estado, la clave quedaba ocupada para siempre y el aviso se perdía de forma permanente.
51. **El motor fallido no queda mudo (la red de seguridad de sección 6.3).** Plantilla con `auto_execute=true` cuya cuenta se borra: el motor no ejecuta, y la partida recibe `due_today`, un único `overdue` y `unexecuted_month_end`. No hay ningún camino en el que un gasto programado termine sin aviso.
52. **Sin materializar no hay alerta, y el plan lo declara.** Mes sin partidas materializadas → 0 alertas para las plantillas activas. Es el borde conocido de sección 6.4 regla 6; el criterio confirma que **no** se genera alerta sin partida, para que el límite sea explícito y no un fallo silencioso.
53. **Aislamiento del outbox entre usuarios.** Con dos usuarios con avisos de partida (`delivery_id` nulo), `GET /api/alerts/outbox` del usuario A devuelve **solo** sus filas: nada con el `payload` ni el `lastError` del usuario B. `POST /api/alerts/outbox/{id}/retry` con un id del usuario B responde **no encontrado**, no reencola. Es la verificación de que `alert_outbox.user_id` existe y se usa.
54. **Migración del outbox con datos de Fase 2.** Aplicada sobre una base con filas existentes, el `user_id` de backfill queda igual al `user_id` de la entrega, ninguna fila queda nula y `SET NOT NULL` no falla.
55. **Borrar una transacción ligada a una partida no revienta con error de constraint.** Con una partida `executed` y su transacción enlazada, el borrado de la transacción **termina bien** y la partida queda `pending` (o bien el borrado se rechaza con un error de negocio controlado, si se elige `RESTRICT`). **Nunca** un `CheckViolation 23514` crudo. Hoy este caso falla garantizado: ver pendiente 6.

---

## 11. Validación

```bash
# Backend (comandos verificados en AGENTS.md)
dotnet restore code.sln
dotnet build code.sln
dotnet run --project GastosApp.API/GastosApp.API.csproj
# POST /api/auth/login  (dev: http://localhost:5181)

# Frontend
pnpm --prefix GastosApp.Web typecheck
pnpm --prefix GastosApp.Web lint
pnpm --prefix GastosApp.Web test        # la lista de tests es explícita en package.json

# Esquema (aplicar DOS veces seguidas: la migración debe ser idempotente)
psql "$ConnectionStrings__DefaultConnection" -f SQL/migrations/2026-09-28_fase3_planned_budget.sql
psql "$ConnectionStrings__DefaultConnection" -f SQL/migrations/2026-09-28_fase3_planned_budget.sql
psql "$ConnectionStrings__DefaultConnection" -c '\d budget_items'
psql "$ConnectionStrings__DefaultConnection" -c '\d recurring_items'
psql "$ConnectionStrings__DefaultConnection" -c '\d budget_item_alert_deliveries'
psql "$ConnectionStrings__DefaultConnection" -c '\d alert_outbox'
psql "$ConnectionStrings__DefaultConnection" -c "SELECT source_type, count(*) FROM alert_outbox GROUP BY 1"
```

Sin proyecto de tests backend: la verificación es build + corrida manual + inspección SQL, igual que en fases previas. Red de seguridad barata recomendada: un self-check de la generación de ocurrencias (`day_of_month=31` en febrero, ventana `starts_period`/`ends_period`) y de la resolución de scope más específico. **No** crear un proyecto de tests por esto.

Matriz (usar `POST /api/alerts/evaluate` para no depender del timer):

| # | Caso | Esperado |
|---|---|---|
| 1 | Presupuesto sin partidas | `committed=0`, `effective=spent`, `status`/`percentUsed` idénticos a Fase 2 |
| 2 | Partida de gasto pendiente | Suma en `committed` y en `committedPercent`; **no** en `spent` |
| 3 | Desglose en barra | Segmento sólido hasta `spentPercent`, rayado hasta `percentUsed`, `aria-valuetext` con ambos |
| 4 | Partida ejecutada | Pasa de `committed` a `spent` sin doble conteo; `effective` constante |
| 5 | Partida de otro mes | No impacta el periodo actual |
| 6 | Partida por subcategoría en presupuesto por categoría | Impacta |
| 7 | Partida de ingreso | No impacta ningún límite de gasto |
| 8 | Rollover `dryRun` | Conteos > 0, 0 escrituras |
| 9 | Rollover real, dos veces | Sin duplicados |
| 10 | Recurrente `day_of_month=31` en febrero | Se materializa en el último día del mes |
| 11 | Partida `pending` el día de vencimiento | Entra `due_today` y llega a `AllowedUserId` |
| 12 | Misma partida, día siguiente | Entra `overdue`; **no** repite `due_today` |
| 13 | Misma partida, último día del mes | Entra `unexecuted_month_end` |
| 14 | Misma partida `pending` en dos meses | **Dos** `unexecuted_month_end`, uno por periodo |
| 15 | Tres alertas de la misma partida y periodo | **Tres** filas de outbox; ninguna descartada |
| 16 | Fila de outbox expirada (`failed`) y condición vigente | Reinserta y envía |
| 17 | Plantilla `auto_execute=true` con cuenta borrada | Motor no ejecuta; partida avisa por `due_today`/`overdue`/`unexecuted_month_end` |
| 18 | Telegram deshabilitado | Guardado con `autoExecute=true` rechazado (400); pendientes de outbox se conservan |
| 19 | Mes sin partidas materializadas | 0 alertas (borde declarado, sección 6.4 regla 6) |
| 11 | `CommittedCountsEnabled=false` con partidas | `percentUsed` = solo `spent` |
| 12 | Umbral 80% con `effective` al 76% | **Sin** entrega; la barra ya muestra el rayado |
| 13 | Umbral 80% con `effective` al 82% (spent 67% + committed 15%) | 1 entrega; payload con líneas `Comprometido` y `Total` |
| 14 | Payload con `committed=0` | Idéntico al de Fase 2 (sin líneas extra) |
| 15 | Partida vencida hoy | 1 entrega `due_today`, 1 outbox |
| 16 | Re-evaluar 10 veces | Sin entregas ni mensajes extra |
| 17 | Telegram deshabilitado con `autoExecute=true` | Guardado rechazado con 400 (sección 7.4); si se deshabilita después, el motor no crea |
| 18 | `DELETE` de presupuesto con entregas | 409 |

---

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Cambio de semántica de `percentUsed` rompe la UI y las alertas existentes** | El agregado y el desglose van juntos en la respuesta; `committed` nace en cero y `CommittedCountsEnabled` nace apagado. El caso 1 de la matriz es la prueba de no regresión |
| **Desglose confuso en pantalla (dos capas mal resueltas)** | El rayado debe distinguirse **sin depender del color**; `aria-valuetext` declara ambos porcentajes. Caso 3 de la matriz |
| **Umbrales disparando antes de lo que el usuario espera** | `CommittedCountsEnabled=false` por default; el desglose se muestra igual, así que la información no se pierde aunque el disparo esté apagado |
| **Fuga de montos por Telegram al entrar un segundo usuario** | **No se mitiga, se excluye**: el destino es único (`AllowedUserId`) y el evaluador no abre alcance por dueño (sección 7.3). El enrutamiento por dueño es requisito previo para un segundo usuario (sección 13) |
| **Doble conteo partida ↔ transacción** | Índice único parcial `uq_budget_items_transaction` + `ck_budget_items_executed`; el enlace es atómico |
| **Partidas fantasma inflando meses cerrados** | Decisión del usuario: caducan a fin de mes; el mes cerrado reporta desviación, no comprometido |
| **Comprometido que crece sin techo** | `projected` fuera del porcentaje por default; `committed` acotado al mes en curso |
| **Rollover duplica y choca con `UX (user, period, scope)`** | `UX (user, period, kind, name)` + `ON CONFLICT DO NOTHING`; recurrentes se **remontan**, no se copian |
| **Perder la FK del outbox** | Aceptado y justificado (sección 3.4): cola transitoria, payload congelado, expiración a 7 días |
| **`ON DELETE SET NULL` en `transaction_id` viola `ck_budget_items_executed`** | **Confirmado por reproducción en PostgreSQL 16, no una sospecha.** `DELETE` de una transacción enlazada a una partida `executed` aborta con `CheckViolation 23514` y hace rollback completo. Obligatorio resolverlo en la Fase 3.2 (criterio 55, pendiente 6): reset explícito de la partida antes del borrado, o `RESTRICT` con error de negocio |
| **Hook de matching altera el flujo de dinero** | Post-commit, `try/catch` que registra y continúa; nunca bloquea ni revierte el registro del gasto |
| **Test nuevo del frontend que nunca corre** | Todo archivo `.test.ts` nuevo se agrega a la lista explícita de `package.json` |
| **Ventana SQL vs `DateTime.UtcNow`** | Siempre `MonthRangeResolver`; nunca `DateTime.Now` ni truncado local |
| **Monto auto-ejecutado distinto al real** (la renta subió y la plantilla no) | La transacción lleva `origin='auto_recurring'` y se distingue en el histórico; el usuario la corrige y el matching reconcilia la partida. Nunca se sobreescribe una transacción ya creada |
| **Bucle de recreación al borrar la transacción automática** | Documentado como comportamiento esperado (sección 4.6 regla 5): para detenerlo se desactiva la plantilla. La UI ofrece "desactivar esta programación" desde la transacción |
| **Doble gasto si el motor corre dos veces** | Guardia de idempotencia en la partida (`status='executed'`); criterio 26 |
| **Motor creando gastos con cuenta ajena** | Filtro por `user_id` de la plantilla en la misma consulta; criterio 43 |
| **Cambio de alcance invalidando el rollback** | El `ALTER` de `transactions` es aditivo con default `'manual'`, así que no rompe datos; pero suma otra alteración no reversible por interruptores (pendiente 9) |
| **Migración manual olvidada** | DDL idempotente + `\d` obligatorio antes de desplegar código |
| **Orden de creación con FK cruzada** (`budget_items` → `recurring_items`) | Orden obligatorio documentado en sección 3 y aplicado en la migración; verificado corriendo el script dos veces |
| **`DeliveryId` nullable rompe compilación** | `AlertOutbox.cs` y sus consumidores se ajustan en la misma Fase 3.1 que la migración, no después |
| **Alertas de partida descartadas en silencio por índice mal definido** (era un bug del plan) | `source_key = {period_key}:{alert_kind}` en la clave única del outbox (sección 3.4). Sin él, `ON CONFLICT DO NOTHING` descartaba la 2.ª y 3.ª alerta **sin error y sin log**. Criterios 48 y 49 |
| **Fila de outbox expirada bloqueando el aviso para siempre** (fallo latente de Fase 2, no solo del camino nuevo) | Predicado `status <> 'failed'` en ambos índices del outbox (sección 3.4). El drenador expira, no borra: sin el predicado la clave quedaba ocupada permanentemente. Criterio 50 |
| **Motor fallido dejando el gasto programado mudo** | Red de seguridad de sección 6.3: las tres alertas de partida cubren la plantilla que no ejecutó (cuenta borrada, Telegram deshabilitado después, error). Criterio 51 |
| **Mes sin materializar = mes de gastos programados en silencio** | Borde declarado (sección 6.4 regla 6) y verificado (criterio 52, pendiente 19): el evaluador recorre partidas, no plantillas |
| **Fuga de outbox entre usuarios por `delivery_id` nullable** (detectada en verificación) | `alert_outbox.user_id NOT NULL` con backfill desde la entrega y FK a `users`. El filtro de lectura pasa a ser una igualdad, sin `OR` que tolere `Delivery == null`. Sin esto, en cuanto existan avisos de partida el listado devolvería los de todos los usuarios. Criterios 53 y 54 |
| **Segundo usuario mete fuga de montos por Telegram** (el destino es único) | Documentado como **exclusión** (sección 13): el enrutamiento por dueño es requisito previo para un segundo usuario. Hoy no hay a quién filtrar (sección 7.3) |
| **Auto-ejecución invisible sin Telegram** | `autoExecute=true` se **rechaza** con 400 si Telegram está deshabilitado o sin configurar (sección 7.4). Si se deshabilita después, el motor no crea. Criterio 34 |
| **`effective_from` retroactiva con `auto_execute=true` crea un gasto con fecha pasada** | Permitida solo dentro del mes en curso (posteriores al primer día); la UI advierte y el aviso de Telegram sale igual (sección 4.7, criterios 32 y 33) |
| **`Repetir` y `Programar` confundidos por el usuario** (dos botones hermanos con nombres parecidos) | Distinción explícita en el diálogo del `Programar` ("se repetirá cada mes", no "capturar ahora"); `Repetir` intacto con su test verde (criterio 16) |
| **Celda de acciones del histórico desbordada** (ya tiene hasta 4 botones) | `Programar` entra con icono sin texto o agrupado en menú (sección 8.7); decisión que se toma en Fase 3.5 |
| **Endpoint nuevo sin guard de rol abre superficie** | No exige rol admin **a propósito** (igual que todo el API: la política es `UserWithId`), pero exige JWT y valida propiedad por `userId`. Criterios 19, 36 y 38 |

---

## 13. Exclusiones explícitas

- **Sin rollover monetario** (arrastrar sobrante en dinero). Esta fase aporta rollover de **plan**, no de saldo. Es una decisión distinta y no está pedida.
- Sin devengado ni MSI prorrateado: se mantiene la decisión de Fase 2 (a caja/fecha de compra).
- Sin multimoneda: MXN únicamente.
- Sin presupuestos anuales/trimestrales.
- Sin LLM en matching, montos ni textos: todo determinista.
- Sin colas externas, sin cron del sistema, sin Hangfire/Quartz/Redis.
- Sin notificaciones fuera de Telegram.
- Sin importación bancaria de partidas planificadas.
- **Sin auto-ejecución de ingresos** (decisión del usuario): v1 solo auto-ejecuta gastos con cuenta de origen.
- Sin reintentos con backoff ni cola de fallos del motor: si un ciclo falla, el siguiente lo recupera (idempotente por diseño).
- **Sin enrutamiento por dueño.** El destino es único (`AllowedUserId`) por decisión del usuario. Con un solo usuario no hay a quién filtrar, pero es lo que habilita el bloqueo de abajo.
- **Sin soporte real para un segundo usuario.** El destino de Telegram es único (`AllowedUserId`) y el evaluador tiene alcance single-user. Si entra un segundo usuario, las alertas de sus partidas llegarían al chat del dueño actual: es una **fuga de montos**, no un detalle estético. Habilitar un segundo usuario exige antes el enrutamiento por dueño (`telegram_identities` → `chat_id`, y romper a propósito la invariante de `ITelegramAlertSender`). No se hace en esta fase porque la decisión del usuario es un solo usuario.

---

## 14. Pendientes de verificación (no bloquean el arranque)

1. **CERRADO** — semántica del porcentaje: `effective = spent + committed` compone el porcentaje, con `spent` y `committed` **diferenciados visualmente** (sección 2.3, sección 4.2). `projected` fuera del número por default.
2. **CERRADO** — alcance de la ejecución automática (decisión del usuario): auto **solo** en gastos con `account_id`; ingresos y gastos sin cuenta solo avisan y esperan confirmación (sección 4.6). Requiere el `ALTER` de `transactions` y el motor de sección 4.6.
3. Definir `N` del promedio para `amount_mode='average'` (propuesto: 3 meses).
4. Definir la tolerancia de monto del auto-match (propuesto: exacta, `0%`).
5. **CERRADO sin uso en v1** — `telegram_identities` (`SQL/schema.sql:372-386`) ya mapea `user_id` ↔ `telegram_chat_id` con `active`. **No se usa en esta fase** porque el usuario decidió que las alertas sigan con destino único (sección 7.3). Queda registrado como la pieza que haría falta para el enrutamiento por dueño si algún día entra un segundo usuario.
6. **CONFIRMADO, ya no es sospecha** — el `ON DELETE SET NULL` de `budget_items.transaction_id` **falla garantizado** contra `ck_budget_items_executed`. Reproducido en PostgreSQL 16: con una partida `executed` ligada a la transacción 50, `DELETE FROM transactions WHERE transaction_id = 50` aborta con `CheckViolation 23514` (`new row ... violates check constraint "ck_budget_items_executed"`) y el `DELETE` completo hace rollback. `SET NULL` es una promesa que la base no puede cumplir.
   **Debe resolverse en la Fase 3.2, no después** (criterio 55). Opciones, en orden de preferencia:
   - **Reset explícito antes del borrado**: en la misma transacción SQL, `UPDATE budget_items SET status='pending', transaction_id=NULL WHERE transaction_id = @id` y luego borrar la transacción. Respeta la decisión original (`SET NULL` + coherencia) y convierte el `CheckViolation` en flujo normal. Requiere localizar **todos** los caminos de borrado de `transactions` (endpoint de borrado y cualquier cascada de cuenta), que es lo que hay que inventariar.
   - **`ON DELETE RESTRICT`** en su lugar: convierte el fallo crudo de constraint en un error de negocio controlado (409/400 con mensaje), pero obliga al usuario a desligar la partida a mano.
   - **Debilitar el `CHECK`** para permitir `status='executed'` con `transaction_id` nulo: **no** hacerlo, destruye la garantía de que "ejecutada" implica "hay transacción".
7. Confirmar si **eliminar** un presupuesto debe existir en v1 o basta con desactivar. La base no permite borrado duro irrestricto, y quizá desactivar sea suficiente.
8. **CERRADO** — el usuario revisó la apertura y la **revertió**: "si nada es accesible a un no-admin, entonces dejarlo así, todo admin". La pantalla vive en `Catálogos` con guard admin, el layout `(app)` no se toca y no hay checklist de permisos. El costo de la apertura se evitó por completo.
9. **El rollback de sección 3.4 no es puro**: el `ALTER` de `alert_outbox` (quitar FK, agregar `source_type`/`source_id`) no se revierte apagando interruptores. Verificar que exista una ruta de reversa escrita antes de aplicar en un entorno que no sea el de desarrollo.
10. **Desactivar `auto_execute` a mitad de mes** deja las partidas ya materializadas pero impide la ejecución: confirmar que el motor consulta el flag **en el momento de ejecutar**, no al materializar. Decisión de diseño: consultar en ejecución (permite cortar el flujo sin esperar al mes siguiente).
11. Definir la **cadencia del motor** de sección 4.6 (propuesto: heredar el intervalo de `AlertEvaluationBackgroundService`) y confirmar que su `Task.Delay` inicial no dispara en el arranque en frío.
12. **NO APLICA** — no se retira `requireAdminSession()` del layout `(app)`. Criterio 44 lo verifica en sentido contrario: el layout y las 18 páginas quedan intactos.
13. **NO APLICA** — el histórico es admin-only y el usuario decidió mantener todo admin, así que el botón `Programar` nace admin-only sin asimetría que resolver.
14. **CERRADO** — la frontera se simplificó a "primer día del mes en curso": `effective_from` anterior a esa fecha → 400. No hay detección de "mes cerrado" que definir, porque ningún caso lo alcanza.
15. **Confirmar que `effective_from` no rompe el remonte.** El rollover (sección 2.4) recalcula la fecha al mes destino usando `day_of_month`; `effective_from` solo debe aplicar al **primer** periodo. Verificar que el remonte de meses posteriores no arrastre la fecha efectiva vieja.
16. **Orden del aviso de ejecución automática** (sección 4.6 regla 8): confirmar en implementación que el encolado ocurre **después** del commit de la transacción. Si se encola dentro de la misma transacción y el envío falla, el gasto podría quedar sin registrarse — el orden correcto es gasto primero, aviso después.
17. **Verificar la condición exacta del 400 de sección 7.4.** Propuesta: mismo guard que `AlertEvaluationBackgroundService.cs:71-81` (`Telegram:Enabled` && `AppUserId > 0` && `BotToken` no vacío). Confirmar que no bloquee el modo desarrollo con Telegram apagado: la validación **solo** debe aplicar cuando el usuario intenta `autoExecute=true`, no al resto del CRUD.
18. **Encender `UnexecutedAlertEnabled` es parte de cerrar la fase** (sección 6.2). Se entrega en `false` por seguridad de despliegue, pero con `false` el requisito "alertas cada gasto programado" **no se cumple**. Verificar en la validación final que las alertas de partida realmente llegan con el interruptor encendido.
19. **Confirmar que abrir el mes materializa las partidas** (sección 6.4 regla 6). Las alertas se evalúan sobre **partidas**, no sobre plantillas: un mes sin materializar es un mes de gastos programados en silencio. Verificar que `copy-on-open` (sección 2.4) corre al abrir la pantalla de Presupuestos, o que existe otro camino que lo garantice.
20. **Verificar la idempotencia de los dos índices nuevos del outbox** (sección 3.4) contra datos existentes: al recrear `uq_alert_outbox_delivery` con `WHERE status <> 'failed'`, confirmar que no haya filas duplicadas previas de Fase 2 que hagan fallar `CREATE UNIQUE INDEX`. Si las hay, limpiar antes en la misma migración.
