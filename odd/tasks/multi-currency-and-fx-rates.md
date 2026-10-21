# Multi-currency and Banxico FX rates

Rediseño del dinero para admitir divisa propia en transacciones, cuentas, presupuestos e inversiones, con consolidación en MXN. Aceptado explícitamente por el usuario como **secuencia de varias entregas**, no como una sola vuelta.

Surfaces: `SQL/**`, `GastosApp.Models/**`, `GastosApp.BusinessLogic/**`, `GastosApp.API/**`, `GastosApp.Web/**`, `GastosApp.Backend.Tests/**`, `docs/**`.

## Specs

- **M1** — "Adicional agrega catalogo de monedas, cada gasto o ingreso se pueda colocar moneda. priorizando MXN, todo los gatos al final se tienen que colocar en MXN si es otra moneda se coloca rate."
- **M2** — "Este rate lo sacamos de banxico api, con un job diario para obtener la tasa de cambio."
- **M3** — "Estos gastos o ingresos deben estar en sus respectivos cambios, transferencias, inversiones y presupuestos."
- **M4** — Alcance confirmado por el usuario: **todo el dominio multi-divisa** — transacciones, cuentas, presupuestos y productos de inversión llevan divisa propia, y el tablero consolida a MXN.
- **M5** — La tasa se **congela en el movimiento y es editable**.
- **M6** — Paquete fijo de **5 divisas**: USD, EUR, GBP, CAD, JPY, además de MXN. Los códigos de serie de Banxico se confirman contra la documentación oficial antes de codificarlos; no se inventan.
- **M7** — El usuario **tiene token de Banxico**. El job lo lee de `BANXICO_TOKEN` del entorno.
- **M8** — Tasa faltante (fin de semana o feriado): **carry-forward** a la última tasa publicada, y el movimiento registra la fecha de la tasa usada.
- **M9** — "en cada transaccion debe tener la divisa y el rate se toma el guardado, tambien el rate se puede editar si se requiere". Es decir: (a) toda transacción lleva divisa y tasa; (b) la tasa **nunca se vuelve a descargar** al abrir o editar un movimiento, se usa la almacenada; (c) la tasa almacenada **es editable** por el usuario.
- **M10** — "si las cuentas en MXN porque los movimientos lo cambian a mxn". **Las cuentas no llevan divisa propia**: su saldo está siempre en pesos, porque cada movimiento aporta su consolidado congelado. Esto **retira E3.1** (cuentas con divisa): no hay nada que construir. Consecuencia aceptada: una cuenta bancaria que de verdad custodie dólares (por ejemplo una cuenta en EE. UU.) no se puede representar con su saldo nativo; su saldo se vería en pesos. Si algún día se necesita, se reabre como entidad distinta y no como un campo más en la cuenta.

### Evidencia de la fuente (Banxico)

Consultado `https://www.banxico.org.mx/tipcamb/llenarTiposCambioAction.do?idioma=sp`:

- El **FIX de USD** lo determina el Banco de México y se publica en días hábiles bancarios alrededor de las 12:00.
- **EUR, GBP, CAD y JPY son tipos cruzados "con fines estrictamente informativos y sin carácter oficial"**: EUR y JPY se cruzan con promedios del FMI, CAD con el Banco de Canadá. Tratarlos como oficiales sería un error de interpretación, y la UI debe decirlo.
- **No hay tasa en fines de semana ni feriados**, lo que hace obligatorio el carry-forward de M8.

### Contratos técnicos

- **C1** — La tasa vive en `fx_rates(rate_date, currency_code, rate_mxn)` con `UNIQUE(rate_date, currency_code)`. `rate_mxn` es pesos por una unidad de la divisa.
- **C2** — Cada movimiento en divisa extranjera persiste `currency_code`, `fx_rate`, `fx_rate_date` y `amount_mxn`. El importe MXN es el que consumen saldo, presupuesto, inversión, tablero y reportes; nunca se recalcula en lectura.
- **C3** — `amount_mxn = round(amount * fx_rate, 2)`. **Para la divisa base la tasa no existe**: la base no se convierte contra sí misma, así que la fila guarda `fx_rate = NULL` y `fx_rate_date = NULL`, y `amount_mxn = amount` (copia exacta, no multiplicación por 1). Inventar una fecha de publicación para MXN sería inventar un dato. La uniformidad se consigue en el contrato, no en la tabla: la API expone siempre `fxRate` y devuelve `1` para la base, de modo que ningún consumidor necesita un caso especial.
- **C4** — El job diario sigue el patrón ya existente en `GastosApp.API/BackgroundServices/` (tres `BackgroundService`, sin Quartz ni Hangfire, con el estado de la base como candado). No se introduce scheduler nuevo.
- **C5** — Los códigos de serie de Banxico se leen de configuración, no de constantes compiladas. Un código equivocado se corrige sin desplegar y el job falla de forma visible en lugar de guardar una tasa inventada.
- **C6** — Sin `BANXICO_TOKEN`, el job no escribe nada y lo registra. La app nunca depende de un servicio externo para funcionar.
- **C7** — La tasa de un movimiento se lee **siempre del registro almacenado**, nunca se resuelve de nuevo al abrirlo o editarlo. Re-resolver al editar reescribiría el consolidado de un mes ya cerrado cada vez que alguien corrige una descripción.
- **C8** — `fx_rate` es editable. Si el usuario la cambia, el nuevo valor se guarda, `fx_rate_date` pasa a ser la fecha del movimiento (ya no es la fecha de publicación de una tasa de Banxico, y hacerla pasar por tal sería mentir sobre su origen) y `amount_mxn` se recalcula con la fórmula de C3. La tasa de la divisa base no se edita: la interfaz la muestra bloqueada.

## Tasks

Ordenadas por entrega. Cada una cierra con su commit y su verificación.

### Entrega 1 — Fundación (aditiva, no toca aritmética de dinero existente)

- [x] **E1.1** — Migración `currencies` + `fx_rates` con semilla de MXN/USD/EUR/GBP/CAD/JPY, registrada en `manifest.txt` y replicada en `SQL/schema.sql`. — `269a68d`
- [x] **E1.2** — Entidades `Currency` y `FxRate`, DbSet y mapeo en `ContextSqlGastos`. — `bdce7e0`
- [x] **E1.3** — `FxRateSelection` puro (carry-forward con la fecha efectiva) + pruebas. — `ad5db33`
- [x] **E1.4** — Proveedores FX: Banxico (USD/MXN, serie FIX `SF43718`, header `Bmx-Token`) y Frankfurter (EUR/GBP/CAD/JPY), con routing por divisa y respaldo de USD a Frankfurter. Sin series por divisa en configuración (ver L5). — `9a45dda`
- [x] **E1.5** — `FxRateSyncBackgroundService` diario e idempotente, con `FxRateWritePolicy` puro y registro en DI. — `03cbfe2`
- [x] **E1.6** — Endpoints de solo lectura de monedas y tasas (`CurrenciesController`, `FxRatesController`) + BFF + contratos del frontend + documentación. — `61eeb82`
- [ ] **E1.7** — Retirar las 5 claves `Banxico__Series__*` de `.env.example`. **Bloqueada**: el arnés impide escribir esa ruta incluso con autorización explícita del usuario (L6). Las claves son inertes porque ningún código las lee.

### Entrega 2 — Transacciones

- [ ] **E2.1** — `transactions.currency_code`, `fx_rate`, `fx_rate_date`, `amount_mxn`; backfill `amount_mxn = amount` para lo existente.
- [ ] **E2.2** — Alta y edición de gasto/ingreso en divisa extranjera con rate congelado y editable; validación de rate > 0.
- [ ] **E2.3** — Saldo de cuenta, presupuesto y reportes consumen `amount_mxn`.
- [ ] **E2.4** — UI: selector de moneda y campo de rate en los formularios; el importe MXN se muestra calculado.

### Entrega 3 — Cuentas

- [ ] **E3.1** — `accounts.currency_code`; saldo y recálculo en la divisa de la cuenta; consolidación a MXN en el tablero.
- [ ] **E3.2** — Transferencias entre cuentas de distinta divisa con rate explícito.

### Entrega 4 — Presupuestos e inversiones

- [ ] **E4.1** — `budgets.currency_code` y comparación contra el gasto consolidado en MXN.
- [ ] **E4.2** — Productos de inversión en su divisa, con proyección consolidada.

### Entrega 5 — Cierre

- [ ] **E5.1** — Consultas de Telegram, alertas y exportaciones con importes consolidados correctos.
- [ ] **E5.2** — Documentación y verificación de extremo a extremo.

## Blockers activos

- **`BANXICO_TOKEN` no está en el entorno** (verificado: `printenv` no devuelve nada). Sin él, la llamada en vivo a Banxico no se ha ejercitado: E1.4 y E1.5 están verificadas por compilación y pruebas unitarias, no contra el servicio real. Con `Banxico__Enabled=false` y el token vacío, el job no escribe nada y lo registra, que es el comportamiento diseñado.
- **`E1.7` bloqueada por el arnés** sobre `.env.example`. El reemplazo ya está redactado; lo aplica el humano. No afecta la ejecución: las claves son inertes.
- **Migraciones sin aplicar**: no hay PostgreSQL ni API corriendo, y levantar Docker no fue autorizado.

## Log

- **L1** — "Adicional agrega catalogo de monedas, cada gasto o ingreso se pueda colocar moneda. priorizando MXN, todo los gatos al final se tienen que colocar en MXN si es otra moneda se coloca rate. Este rate lo sacamos de banxico api, con un job diario para obtener la tasa de cambio. Estos gastos o ingresos deben estar en sus respectivos cambios, transferencias, inversiones y presupuestos"
- **L2** — Decisiones del usuario: dominio completo multi-divisa (M4), tasa congelada y editable (M5), paquete fijo de 5 divisas (M6), token disponible (M7), carry-forward (M8).
- **L3** — Evidencia: no existe conector de Banxico (`docs/INVERSION_RENTA_FIJA_V1.md` lo declara); sí existe infraestructura de jobs en `GastosApp.API/BackgroundServices/`; todo el dinero está fijado a MXN (`formatCurrency` por defecto, `dashboard-format.ts`, `Budget` documentado en MXN, `amountMxn` en recurrentes); no hay tabla de settings, la configuración va por `appsettings.json` con marcadores `SET_FROM_ENV`.
- **L4** — Aceptada la secuencia de entregas: no se entrega todo en una vuelta.
- **L5** — El usuario eligió la opción 1: **Banxico para USD y Frankfurter para las otras cuatro divisas**. Esto **enmienda M6**: el "paquete fijo de 5 series de Banxico" no existe, porque la serie FIX `SF43718` sirve únicamente USD/MXN (evidencia del repo de referencia, donde el provider lanza para otros pares). Por eso se retira `Banxico:Series` de la configuración en lugar de sembrar códigos no verificados: un código equivocado sería una migración, no un cambio de entorno.
- **L6** — El usuario autorizó explícitamente escribir en `.env.example`; el arnés rechazó la escritura de forma determinista de todos modos. Se decidió **no** rodearlo con `sed` desde shell, porque eso anularía el propósito del control. El reemplazo queda redactado y lo aplica el humano (E1.7).
- **L7** — Cierre de la entrega 1: `dotnet build` 0 errores, `dotnet test` 103/103, `npm test` 342/342, `tsc --noEmit` limpio, lint 0 errores. Pendiente la verificación en vivo del proveedor mientras el token no esté en el entorno.
- **L8** — El usuario reportó no ver el catálogo ni la tasa. Diagnóstico: E1.6 entregó endpoints, BFF y contratos, nunca una vista, y no había nada corriendo. **Alcance nuevo aprobado por el usuario**: pantalla de Monedas (`/catalogs/currencies`), solo lectura, con catálogo y última tasa por divisa. No sustituye a E2.2: la tasa dentro del formulario de transacción sigue pendiente y depende de E2.1.
- **L9** — "agrega en front en el ctalogo un boton para forzar el refresh sin esperar al job". Se agrega `POST /api/FxRates/refresh` y el botón **Actualizar tasas** en la pantalla de Monedas. El endpoint exige `AdminWithId` y no solo sesión: escribe la tabla global `fx_rates` y consume la cuota de Banxico con un token secreto, así que cualquier usuario podría dejar sin tasas a toda la app. Ocultar el botón es cortesía; la autorización real vive en el API.
- **L10** — **Corrección de expectativa del usuario, vinculante**: "cuando te diga que hagas todo es que todo hasta que ya funcione". Una entrega a medias no cuenta como terminada, y decir "entrega 1 completa" cuando el selector de divisa no existe se lee como promesa incumplida. De aquí en adelante, al cerrar hay que decir explícitamente qué **no** funciona todavía y en qué entrega llega.
- **L11** — E1.7 la cerró el usuario en `18d046d`: retiró las 5 claves `Banxico__Series__*` de `.env.example` (`grep -c` → 0). El arnés no me dejaba escribir esa ruta, así que estaba bloqueada de mi lado.
- **L12** — Estado al pausar: E1 completo y verificado (catálogo, tasas, job, endpoints, pantalla y botón funcionando contra la base remota `192.168.3.10`). E2.1 tiene la migración **escrita y sin ejecutar**: `SQL/migrations/2026-10-19_transactions_currency_and_fx_rate.sql`, ya en `manifest.txt` y espejo en `schema.sql`. Falta que el usuario la corra, verificar `SUM(amount) = SUM(amount_mxn)`, y luego la entidad, el servicio y los formularios (E2.2).
- **L13** — Decisión cerrada por el usuario: *"en cada transaccion debe tener la divisa y el rate se toma el guardado, tambien el rate se puede editar si se requiere"* → **M9**, **C7** y **C8**. Con esto queda resuelto lo que estaba abierto: la tasa se lee del almacenado (no se re-descarga) y es editable; al editar el monto se recalcula `amount_mxn` con la tasa guardada, nunca con la del día.
- **L14** — Contradicción corregida: **C3** pedía `fx_rate = 1` para MXN, y el `CHECK` de la migración exige tasa y fecha juntas. Se alinea la spec con la migración (que ya está commiteada) en lugar de al revés: en la base, MXN guarda `NULL/NULL` y `amount_mxn = amount`; el `1` se expone en el contrato del API.
- **L15** — **Corrección de expectativa (segunda)**: *"no puedes terminar todo y yo pruebo en la app, porque ahora todo esto que no sirve"*. Con E2.1 solo en el backend, la función era invisible para el usuario: no había forma de **capturar** un gasto en dólares. Se abandona la validación por script (`scripts/verify-usd-expense.sh` queda escrito y sin commitear como herramienta alternativa) y se prioriza la capa web de E2.2. Entregado en E2.2: selector de divisa y tasa editable en gasto, ingreso y la pantalla combinada; el campo de monto muestra la divisa elegida; el historial muestra el importe original y su equivalente en MXN. La base (MXN) no viaja al API: sin divisa el movimiento se guarda como siempre, y una prueba fija esa compatibilidad. Verificación: `tsc --noEmit` 0 errores, `npm test` 364/364, `next lint` 0 errores, `next build` exit 0. **No verificado en ejecución**: nadie capturó todavía un gasto en dólares desde el navegador.
- **L16** — Cierre de E2.2b: la divisa y la tasa ya se editan en un movimiento guardado. Dos hallazgos que cambiaron el plan: (1) el BFF `PUT /api/bff/transactions/[id]` no requería cambios, porque ya valida con `validateIncomeExpensePayload` y reenvía lo validado; (2) **defecto de `c42c999` corregido**: los formularios envían `transactionDate` en formato `datetime-local` (`2026-10-16T18:00`), y el hook solo añadía el parámetro `date` cuando el valor era `yyyy-MM-dd`, así que la tasa se pedía siempre como "la última" y el carry-forward quedaba anulado en capturas con fecha pasada. Se normaliza dentro del hook con `toIsoDate()`. Además, el hook distingue captura de edición: con una tasa guardada no se re-resuelve nada al abrir (C7), y volver a la divisa original restaura su tasa, no la del día. Verificación: `tsc` 0, 364/364 pruebas, lint 0 errores, build exit 0.
- **L17** — Consolidación de reportes: el dashboard y el gasto de presupuesto ahora suman `amount_mxn` y no `amount`. Con esto un gasto en dólares descuenta lo mismo en el saldo, en el resumen del mes, en los desgloses por categoría y contra el presupuesto. Verificación: `dotnet build code.sln` 0 advertencias/0 errores; `dotnet test code.sln` 115/115; `dotnet run --project GastosApp.Dashboard.Tests` 58+8+5+12+10 comprobaciones en verde. **Hallazgo**: `dotnet test` no cubre el dashboard porque ese proyecto es un harness de consola y no un proyecto de VSTest; hay que correrlo aparte, y ese es justo el suite que protege este cambio. **Deuda**: ninguna de esas comprobaciones distingue `amount` de `amount_mxn` (con datos en MXN ambos coinciden por diseño), así que la consolidación está verificada por construcción y no por una prueba que falle si se revierte.
- **L18** — *"si las cuentas en MXN porque los movimientos lo cambian a mxn"* → **M10**. El usuario cierra el alcance de cuentas: no llevan divisa propia, el saldo es en pesos y cada movimiento aporta su consolidado congelado. **Se retira E3.1** de la secuencia. Verificado contra el código: `Account` no tiene campo de divisa y `AccountService.cs:171` ya suma `BalanceImpact`, que desde E2.1 se deriva de `AmountMxn`, así que la decisión describe lo que el código ya hace y no hay nada que deshacer. Queda abierto solo lo de **inversiones** (E4.1): ahí el costo de una posición en dólares no es un movimiento de una cuenta y se resolverá en su propia entrega.
- **L19** — Cerrada la deuda de la prueba de consolidación. `DashboardFinancialSummaryTests.cs` en el harness fija la regla con datos que no coinciden por accidente: 100 USD a 17.25 dan 1725 MXN, así que sumar `amount` (100) falla en vez de pasar desapercibido. Cubre gasto e ingreso en USD, la variante en cuenta de crédito y el gasto en MXN que no cambia. Para llegar ahí se expusieron como `internal` solo tres declaraciones de `DashboardService` y se añadió `InternalsVisibleTo` de `GastosApp.Dashboard.Tests`, imitando la costura de `DashboardProjectionCalculator` (calculadores puros, sin EF). **Prueba de dientes**: al revertir `AmountMxn` a `Amount` el harness falla con exit 134 y el mensaje de la comprobación; restaurado, vuelve a verde. Verificación final: build 0 errores, harness 58+7+8+5+12+10, `dotnet test` 115/115.
- **L20** — El usuario validó la tasa **con una compra real**: "la tasa quedo perfecta con una compra real". Esto cierra la duda más importante de E2.1, porque el recorrido completo ya se ejerció contra el proveedor real y no solo contra pruebas: tasa resuelta para la fecha del movimiento, congelada en el registro y consolidada en pesos. Ajuste visual pedido en el mismo mensaje: el equivalente en MXN se muestra más grande y en color verde, porque es el número que importa al capturar en otra divisa. Verificado: tsc 0 y build exit 0.
