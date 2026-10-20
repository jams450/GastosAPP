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

### Evidencia de la fuente (Banxico)

Consultado `https://www.banxico.org.mx/tipcamb/llenarTiposCambioAction.do?idioma=sp`:

- El **FIX de USD** lo determina el Banco de México y se publica en días hábiles bancarios alrededor de las 12:00.
- **EUR, GBP, CAD y JPY son tipos cruzados "con fines estrictamente informativos y sin carácter oficial"**: EUR y JPY se cruzan con promedios del FMI, CAD con el Banco de Canadá. Tratarlos como oficiales sería un error de interpretación, y la UI debe decirlo.
- **No hay tasa en fines de semana ni feriados**, lo que hace obligatorio el carry-forward de M8.

### Contratos técnicos

- **C1** — La tasa vive en `fx_rates(rate_date, currency_code, rate_mxn)` con `UNIQUE(rate_date, currency_code)`. `rate_mxn` es pesos por una unidad de la divisa.
- **C2** — Cada movimiento en divisa extranjera persiste `currency_code`, `fx_rate`, `fx_rate_date` y `amount_mxn`. El importe MXN es el que consumen saldo, presupuesto, inversión, tablero y reportes; nunca se recalcula en lectura.
- **C3** — `amount_mxn = round(amount * fx_rate, 2)`. Para MXN, `fx_rate = 1` y `fx_rate_date` nula.
- **C4** — El job diario sigue el patrón ya existente en `GastosApp.API/BackgroundServices/` (tres `BackgroundService`, sin Quartz ni Hangfire, con el estado de la base como candado). No se introduce scheduler nuevo.
- **C5** — Los códigos de serie de Banxico se leen de configuración, no de constantes compiladas. Un código equivocado se corrige sin desplegar y el job falla de forma visible en lugar de guardar una tasa inventada.
- **C6** — Sin `BANXICO_TOKEN`, el job no escribe nada y lo registra. La app nunca depende de un servicio externo para funcionar.

## Tasks

Ordenadas por entrega. Cada una cierra con su commit y su verificación.

### Entrega 1 — Fundación (aditiva, no toca aritmética de dinero existente)

- [ ] **E1.1** — Migración `currencies` + `fx_rates` con semilla de MXN/USD/EUR/GBP/CAD/JPY, registrada en `manifest.txt` y replicada en `SQL/schema.sql`.
- [ ] **E1.2** — Entidades `Currency` y `FxRate`, DbSet y mapeo en `ContextSqlGastos`.
- [ ] **E1.3** — `FxRateSelection` puro (carry-forward con la fecha efectiva) + pruebas.
- [ ] **E1.4** — `IBanxicoFxClient` + conector HTTP, series desde configuración, `BANXICO_TOKEN` del entorno.
- [ ] **E1.5** — `FxRateSyncBackgroundService` diario, idempotente, y registro en `ServiceCollectionExtensions`.
- [ ] **E1.6** — Endpoints de solo lectura de monedas y tasas + BFF + contratos del frontend.

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

- **`BANXICO_TOKEN` no está en el entorno.** Sin él no puedo ejecutar el job ni confirmar las series contra el servicio real. E1.4 y E1.5 se entregan con la llamada HTTP sin verificar en vivo.
- **Códigos de serie sin confirmar.** La verificación documental salió con confianza insuficiente; se dejan en configuración (C5) y quedan por confirmar con el token.

## Log

- **L1** — "Adicional agrega catalogo de monedas, cada gasto o ingreso se pueda colocar moneda. priorizando MXN, todo los gatos al final se tienen que colocar en MXN si es otra moneda se coloca rate. Este rate lo sacamos de banxico api, con un job diario para obtener la tasa de cambio. Estos gastos o ingresos deben estar en sus respectivos cambios, transferencias, inversiones y presupuestos"
- **L2** — Decisiones del usuario: dominio completo multi-divisa (M4), tasa congelada y editable (M5), paquete fijo de 5 divisas (M6), token disponible (M7), carry-forward (M8).
- **L3** — Evidencia: no existe conector de Banxico (`docs/INVERSION_RENTA_FIJA_V1.md` lo declara); sí existe infraestructura de jobs en `GastosApp.API/BackgroundServices/`; todo el dinero está fijado a MXN (`formatCurrency` por defecto, `dashboard-format.ts`, `Budget` documentado en MXN, `amountMxn` en recurrentes); no hay tabla de settings, la configuración va por `appsettings.json` con marcadores `SET_FROM_ENV`.
- **L4** — Aceptada la secuencia de entregas: no se entrega todo en una vuelta.
