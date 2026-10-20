# Responsive UI revamp and interest income

Two workstreams in one authorized delivery: (a) whole-app mobile adaptation with a new visual style, and (b) a way to mark an income movement as account interest yield. Surfaces: `GastosApp.Web/**`, `GastosApp.Models/**`, `GastosApp.BusinessLogic/**`, `GastosApp.API/**`, `SQL/**`, `GastosApp.Backend.Tests/**`.

Branch policy: work happens on `feat/responsive-ui-and-interest-income`. **No commit, branch creation, push or migration execution happens without explicit user authorization** (Safety rule overrides the ODD commit default). Migration files are authored, never applied.

## Specs

- **S1** — "Requiero que toda la app se adapte a moviles, y tambien screen perquenas principalmente tablas donde las acciones luego ocupan toda la pantalla y no se ve bien."
- **S2** — "Requiero estilo visual nuevo" — direction chosen by the user: **Evolución Amitzi**. Grafito `#0F1115`, superficies `#181B21` / `#1E2229`, acento azul `#3B82F6`, radios 10 / 14 / 20 px, una sola sombra, `tabular-nums`, densidad alta (filas 36px, cards 12px de padding), menos glows y gradientes decorativos, más contraste de jerarquía, acciones secundarias discretas.
- **S3** — Table pattern chosen by the user: **híbrido**. Tarjetas por debajo de 640px; entre 640px y 1024px tabla reducida con menú de acciones `⋮`; por encima de 1024px tabla completa con acciones en línea.
- **S4** — Theme scope chosen by the user: **mantener claro + oscuro y eliminar las variantes** `data-theme="blue"` y `data-theme="light-blue"`.
- **S5** — "Adicional requiero una mandera de registrar el rendimiento, de una cuenta que da interes. tenemos ahora inveersiones y estima el rendimiento, actualmente lo meto como ingreso en la cuenta asi que deberia tomarlo en automatico o una forma de indicar que ese movimiento es por interes"
- **S6** — Registro chosen by the user: **marcarlo al capturar el ingreso**. Interruptor `Rendimiento` en el formulario de ingreso, visible solo cuando la cuenta seleccionada devenga interés.
- **S7** — Cálculo chosen by the user: **no calcular, solo clasificar**. La proyección de Inversiones sigue siendo informativa y nunca se convierte en un ingreso.
- **S8** — Historial chosen by the user: **dejar el histórico intacto**. Sin reclasificación ni backfill de movimientos existentes.
- **S9** — Scope chosen by the user: **todo junto**, una sola entrega.

### Contratos técnicos (derivados de S1–S9, no requisitos nuevos)

- **C1** — El flag de rendimiento es aditivo: `transactions.is_interest BOOLEAN NOT NULL DEFAULT FALSE` con `CHECK (is_interest = FALSE OR type = 'income')`. No se toca el vocabulario de `type` (`income`/`expense`/`transfer`/`opening_credit`/`transfer_in`/`transfer_out`) porque gobierna el signo del saldo y el motor de transferencias. No se reusa `origin` porque significa `manual` vs `auto_recurring`.
- **C2** — El rendimiento **sí mueve el saldo**: es dinero real acreditado y sigue siendo `type = 'income'` para todo cálculo existente. El flag solo agrega clasificación.
- **C3** — `DataGrid` mantiene sus props actuales sin renombrar ni quitar (`columns`, `rows`, `mobileCards`, `stickyActionsColumn`, …). Lo nuevo es aditivo y opcional, leído desde `ColumnDef.meta`: `mobileLabel`, `mobileRole`, `tabletHidden`, `align`.
- **C4** — Sin `meta`, una columna cae en el comportamiento actual: sigue apareciendo en la tabla y no se inventa una etiqueta de tarjeta.
- **C5** — La navegación por teclado, `aria-sort`, `aria-expanded`, foco visible y objetivos táctiles de 44px del contrato `DESIGN.md` se conservan.

## Tasks

- [ ] **T1** — Retirar `data-theme` (S4): eliminar los bloques `:root:not(.dark)[data-theme="blue"|"light-blue"]` de `app/globals.css` y el `paletteTheme` del script de arranque en `app/layout.tsx`; actualizar `DESIGN.md` / `THEME_COLORS.md`. Commit: `refactor(web): drop unused palette theme variants`.
- [ ] **T2** — Tokens y apariencia "Evolución Amitzi" (S2): radios 10/14/20, escala de sombra única, bordes hairline, jerarquía de contraste, glows y gradientes decorativos retirados, acciones secundarias discretas. `app/globals.css` + `DESIGN.md` como contrato. Commit: `style(web): rework design tokens for the Amitzi evolution`.
- [ ] **T3** — Motor responsive de `DataGrid` (S1, S3, C3–C5): tarjetas `< sm`, tabla `≥ sm`, menú `⋮` `< lg` con popover en portal (no se recorta en el contenedor con scroll), `meta` por columna, tarjeta automática con override por `mobileCards`. Lógica pura en `lib/ui/grid-responsive.ts`. Commit: `feat(web): add responsive grid modes and row actions menu`.
- [ ] **T4** — Prueba de la proyección de columnas a tarjeta/tablet (S1, S3, C3, C4) en `lib/ui/grid-responsive.test.ts`, registrada en `npm test`. Commit junto a T3.
- [ ] **T5** — Catálogos adaptados (S1, S3): categorías, subcategorías, comercios, tags, terceros, recurrentes. Commit: `feat(web): adapt catalog tables to the hybrid mobile pattern`.
- [ ] **T6** — Transacciones adaptadas (S1, S3): historial regular y grupos de transferencia. Commit: `feat(web): adapt transaction history to the hybrid mobile pattern`.
- [ ] **T7** — Presupuestos adaptados (S1, S3): historial de avisos, partidas y sugerencias; cuentas, presupuestos y usuarios alineados al nuevo breakpoint. Commit: `feat(web): adapt budget and admin tables to the hybrid mobile pattern`.
- [ ] **T8** — Resto de pantallas (S1): resumen anual de cuenta, inversiones y tablero sin desbordes horizontales. Commit: `feat(web): remove horizontal overflow from remaining screens`.
- [ ] **T9** — Shell y formularios móviles (S1, S2): topbar, `PageHeader`, cajón de navegación, barras de filtro, hojas de formulario a pantalla completa en móvil, pestañas del tablero y gráficas. Commit: `feat(web): make the app shell and forms mobile-first`.
- [ ] **T10** — Backend del flag de rendimiento (S5, S6, S8, C1, C2): migración `SQL/migrations/<fecha>_transaction_interest_flag.sql` + `manifest.txt`, `SQL/schema.sql`, entidad `Transaction`, DTOs de alta/edición/consulta, servicio y controlador. Commit: `feat(api): flag interest income transactions`.
- [ ] **T11** — BFF y contratos del flag (S6, C2): `lib/contracts/transactions.ts`, rutas `income` y `[id]`, y `list` propagan y validan `isInterest`; solo cuentas con `earnsInterest` lo aceptan. Commit: `feat(web): propagate the interest income flag through the BFF`.
- [ ] **T12** — UI del rendimiento (S5, S6, S7): interruptor `Rendimiento` en el formulario de ingreso (visible solo si la cuenta devenga interés), insignia en el historial y edición posterior. Commit: `feat(web): mark income as interest yield in the capture form`.
- [ ] **T13** — Documentación del rendimiento (S7): aclarar en `DESIGN.md`/`docs` que la proyección es informativa y que `is_interest` es clasificación, no cálculo. Commit junto a T12.
- [ ] **T14** — Verificación final (todas): `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, `dotnet build code.sln`, `dotnet test` de los proyectos disponibles y QA de navegador en 375 / 768 / 1280 px. Commit: `chore: verification evidence for responsive revamp`.

## Log

- **L1** — "Requiero que toda la app se adapte a moviles, y tambien screen perquenas principalmente tablas donde las acciones luego ocupan toda la pantalla y no se ve bien. Requiero estilo visual nuevo"
- **L2** — "Adicional requiero una mandera de registrar el rendimiento, de una cuenta que da interes. tenemos ahora inveersiones y estima el rendimiento, actualmente lo meto como ingreso en la cuenta asi que deberia tomarlo en automatico o una forma de indicar que ese movimiento es por interes"
- **L3** — Evidencia de exploración: `accounts` ya persiste `earns_interest` y `annual_interest_rate` (`GastosApp.Models/Entities/Account.cs`, `SQL/schema.sql`) y el contrato del frontend ya los normaliza (`lib/contracts/accounts.ts`), pero **ningún formulario los expone**. `transactions.type` está restringido por `CHECK` a seis valores y `origin` a `manual|auto_recurring`. `InvestmentCalculator.CalculateMonthlyInterest` y `/api/bff/investments/expected-income?period=yyyy-MM` ya calculan el rendimiento proyectado y lo documentan como supuesto, no ingreso. AGENTS.md afirma que no existen proyectos de prueba, pero `code.sln` incluye `GastosApp.Backend.Tests`, `GastosApp.Dashboard.Tests` y `GastosApp.Telegram.Tests`.
- **L4** — Decisiones del usuario (S2–S4, S6–S9) tomadas en un lote de cuatro preguntas antes de escribir código.

## Results

Verification actually executed (frontend cwd `GastosApp.Web` unless noted):

- `npm run typecheck`: pass.
- `npm test`: **331 passed, 0 failed** (was 320 before; +11 from `lib/ui/grid-responsive.test.ts`).
- `npm run lint`: **0 errors**, pre-existing `no-unused-vars` warnings only. One new `react-hooks/exhaustive-deps` warning introduced by this change was fixed before closing.
- `npm run build`: pass (`BUILD_EXIT=0`), which also compiles the Tailwind v4 CSS after the token rework.
- `dotnet test code.sln` (repo root): **75 passed, 0 failed**, `DOTNET_TEST_EXIT=0`, covering `GastosApp.Backend.Tests`, `GastosApp.Dashboard.Tests` and `GastosApp.Telegram.Tests`.
- `TransactionInterestFlagTests`: **RED 1 passed / 7 failed** before implementation (the single pass was the guard asserting the `type` vocabulary is unchanged), then **GREEN 8/8**.
- Playwright at 375×812, 768×1024 and 1280×900 on `/login`: `scrollWidth === clientWidth` (no horizontal overflow), no offending elements, body background `rgb(15, 17, 21)` = the new `#0f1115` token, `document.documentElement.classList.contains("dark") === true`, and `data-theme === null` (the retired variants are gone).

Not verified, and why:

- **Authenticated screens at runtime.** No API (`localhost:5000`) and no PostgreSQL (`localhost:5432`) are running, and no Docker container exists. Starting the stack creates Postgres volumes and services, so it was left to the user. The card/table/`⋮` behaviour is therefore verified by type-checking, the pure-projection tests and the production build — not by rendering a real grid.
- **Migration execution.** `2026-10-19_transaction_interest_flag.sql` was authored and registered in `manifest.txt`; it was never applied to a database. Its DDL was reviewed by reading it and by the static parity test.
- **Number-dense tables keep a contained horizontal scroll** (`investment-plan-grid` `min-w-[850px]`, `investment-dashboard` and the excluded-products table `min-w-[420px]`). They have no action column, they are contained inside their own scroll region, and `.app-page` sets `overflow-x-clip`, so the page never scrolls sideways. Converting them to cards was out of proportion for this delivery; treat it as a follow-up.
- **Editing `isInterest` after the fact.** The API accepts it (`UpdateTransactionRequest.IsInterest`, `null` preserves the current value) but the edit modal has no switch: S6 only asked for marking at capture. Unmarking currently requires the API.

No commit, branch, push or migration was performed: the Safety rule ("never commit unless the user explicitly asks") outranks the ODD work-unit commit default.

## Log (continued)

- **L5** — T1/T2 evidence: `:root` and `.dark` now hold one light and one dark theme; `data-theme` is removed at boot and `paletteTheme` cleared; decorative glows and gradients removed from `body`, `.shell-brand-mark`, `.shell-topbar`, `.shell-page-header`, `PageHeader` and the login canvas; `.table-action*` replaces the raw emerald/blue/amber palette in `tableActionStyles` so row actions are discreet (colour in text and border only).
- **L6** — T3 details: cards below `sm`, `tabletHidden` columns removed between `sm` and `lg`, actions folded into a portal-based `RowActionsMenu` (a `fixed` panel is required because the table shell's `overflow-x-auto` also clips vertically). `gridMeta()` gives the `ColumnDef.meta` shape a typed declaration site, since TanStack's `ColumnMeta` is a type alias and cannot be augmented.
- **L7** — T12 scope note: the live income screen is `app/(app)/transactions/income/income-client.tsx`, not the combined `transactions-client.tsx` (routed at `/transactions/legacy`). Both were wired, because leaving the legacy screen broken would have been a silent regression.
- **L8** — Verification debt accepted for this delivery: authenticated browser QA, migration application, and the switch to edit/unmark a movement as interest.
