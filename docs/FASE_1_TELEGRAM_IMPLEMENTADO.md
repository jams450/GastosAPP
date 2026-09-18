# Fase 1 Telegram — estado implementado

> Nota breve de referencia. Sin secretos, sin valores reales de `.env`, sin IDs reales de Telegram ni `AppUserId`.
> Guía operativa completa: `TELEGRAM_BOT.md`. Diseño original: `docs/PLAN_FASE_1_TELEGRAM_IA.md`.

## Alcance

Registro conversacional de **gastos e ingresos simples** por Telegram con borrador + confirmación explícita, más la consulta de solo lectura ya existente.

- La IA **no escribe ni decide**: solo extrae intención (`GastosApp.AI`, sin tools, sin acceso a DB, sin IDs).
- La autoridad de validación y escritura sigue siendo `GastosApp.BusinessLogic` (`ITransactionService.CreateExpenseAsync` para gasto, `CreateIncomeAsync` para ingreso).
- Nada llega a `transactions` sin confirmación del usuario.

## Comandos (deterministas, sin IA)

| Comando | Efecto |
|---|---|
| `/ayuda` (`/start`) | Lista de comandos y formato. |
| `/gasto <monto> \| <cuenta> \| <categoría> [...]` | Crea borrador `expense`; la categoría debe ser de gasto. |
| `/ingreso <monto> \| <cuenta> \| <categoría> [...]` | Crea borrador `income`; la categoría debe ser de ingreso. |
| `/confirmar` (`sí`, `si`) | Confirma el borrador pendiente del chat. |
| `/cancelar` (`no`) | Cancela el borrador sin tocar `transactions`. |
| `/pendiente` | Muestra el borrador pendiente. |
| `/cuentas`, `/categorias` | Lista catálogos activos para resolución manual (`/categorias` separa gasto/ingreso). |

Funcionan aunque el proveedor LLM esté caído. El texto libre que no es comando pasa por extracción de intención (`RegistrarGasto`/`RegistrarIngreso` → mismo camino que su comando con `source = ai`; `Consulta` → agente de solo lectura; `Desconocido` → aclaración). Atajos `sí`/`no` se resuelven antes del LLM si hay borrador pendiente.

## Borrador y confirmación

- Tabla `telegram_expense_drafts`: `status = pending|confirmed|cancelled|expired`, `intent = expense|income`, `source = manual|ai`, TTL por defecto **15 minutos**.
- **Un solo borrador pendiente por chat** (índice único parcial); el más reciente cancela el anterior.
- Confirmación en **una sola transacción de DB**: bloqueo `FOR UPDATE` de la fila, escritura vía `ITransactionService` según `intent`, y solo entonces `confirmed` + `transaction_id`. Si falla, rollback y el borrador queda `pending`.
- TTL vencido → `expired`, sin escritura.
- **Ingreso a cuenta de crédito:** rechazo temprano. Si el intent es `income` y la cuenta es de crédito (`Account.IsCredit`) **no se crea borrador** y se responde el mensaje de bloqueo (el borrador de Telegram no captura asignaciones a mensualidades). Aplica a `/ingreso` y al texto libre (`RegistrarIngreso`); la lógica de crédito no se modificó.
- **Precondición de catálogo:** sin categorías de tipo `income`, `/ingreso` responde «No tienes categorías de ingreso. Créalas en la aplicación (tipo ingreso) y vuelve a intentarlo.». El borrador muestra su tipo («Borrador de gasto:» / «Borrador de ingreso:»).

## Seguridad

- **Solo chat privado** con el usuario autorizado; no soporta grupos ni canales. Sin identidad activa (o con usuario de Gastos inactivo) → `403`.
- Identidad persistida en `telegram_identities`: `userId` sale de la DB, nunca del mensaje ni del LLM.
- Identidad **sembrada por configuración inicial** (`Telegram__AllowedUserId` + `Telegram__AppUserId`): la siembra es idempotente, valida que el usuario de Gastos exista y esté activo, y no sobrescribe filas existentes. Después, la DB es la autoridad: cada update se autoriza reconsultando `GetActiveByTelegramUserIdAsync` (identidad `active` **y** usuario de Gastos `active`), así que desactivar cualquiera de los dos revoca el acceso.
- Idempotencia durable en `telegram_processed_updates` (claim atómico `INSERT ... ON CONFLICT DO NOTHING`, lease 5 min, máximo 5 intentos): un `update_id` ya `done` no se reprocesa.
- Mantenimiento (`ITelegramMaintenanceService`) expira/purga borradores y purga updates terminados, como máximo cada 6 h y best-effort desde el propio flujo de updates.
- El webhook valida `X-Telegram-Bot-Api-Secret-Token` en tiempo constante; `Telegram__Enabled=false` → `404`.

## Migración SQL manual

Las 3 tablas (`telegram_identities`, `telegram_expense_drafts`, `telegram_processed_updates`) y sus índices viven en:

- `SQL/migrations/2026-09-16_telegram_identity_drafts_idempotency.sql`
- `SQL/migrations/2026-09-16_telegram_processed_updates_claim_token.sql`
- `SQL/migrations/2026-09-18_telegram_draft_income_intent.sql` (CHECK de `intent` admite `income`)
- Reflejadas en `SQL/schema.sql` para instalaciones nuevas.

**No hay runner automático** en el repo: la migración se aplica a mano (ver `TELEGRAM_BOT.md` §9) antes de desplegar el API de Fase 1.

## Pendiente (no implementado / no verificado)

- **Binding del API**: `docker-compose.yml` sigue publicando `5000:8080` (`0.0.0.0`). Debe endurecerse a `127.0.0.1:5000:8080` o quitarse `ports`. **Compose sin modificar.**
- **Túnel**: debe publicar solo `/api/telegram/webhook`; el resto `404`.
- **Firewall/NAT**: sin verificar en el host.
- Verificación en ejecución: identidad/usuario objetivo activo en la DB, soporte de salida JSON estructurada del modelo elegido, retención/purga de `telegram_processed_updates`, y comportamiento de reintentos reales de Telegram.
