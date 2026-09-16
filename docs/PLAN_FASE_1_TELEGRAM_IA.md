# Plan Fase 1 — Registro conversacional de gastos simples por Telegram

> Estado: propuesta ejecutable. No contiene secretos ni valores de `.env`; todos los ejemplos usan placeholders.
> Alcance: registrar **solo gastos simples** desde Telegram, con borrador y confirmación explícita.

---

## 1. Objetivo

Permitir que el usuario autorizado registre un gasto simple conversando con el bot de Telegram, con estas garantías:

1. Nada se persiste hasta que el usuario confirma explícitamente.
2. La IA **solo extrae intención y datos**; nunca escribe ni decide sobre la base de datos.
3. `GastosApp.BusinessLogic` sigue siendo la única autoridad de validación y persistencia.
4. El borrador y el control de duplicados sobreviven a reinicios del API.
5. La identidad de Telegram queda persistida en base de datos, no solo en configuración.

---

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Empaquetado de IA | **Biblioteca `GastosApp.AI`** (class library `net9.0`) referenciada por el API. **No** microservicio, **no** proceso aparte. |
| Rol del API | Orquestador: recibe update, autentica, resuelve identidad, gestiona borrador e idempotencia, enruta y responde. |
| Rol de la IA | Solo extracción de intención → DTO tipado. Sin tools, sin acceso a DB, sin IDs. |
| Rol de BusinessLogic | Autoridad única: valida y persiste vía `ITransactionService.CreateExpenseAsync`. |
| Escritura | Borrador persistido + confirmación explícita del usuario. Nunca escritura directa al detectar intención. |
| Identidad | Tabla `telegram_identities` (persistente). La config solo siembra/arranca; la DB es la autoridad. |
| Idempotencia | Tabla `telegram_processed_updates` (durable). Reemplaza el `ConcurrentDictionary` del controlador. |
| Tools de IA | **Ninguna** tool de escritura. Las 3 tools de lectura existentes se mantienen sin cambios. |
| Orden de construcción | Comandos manuales deterministas primero; extracción IA después, sobre el mismo flujo. |
| Estado de borrador | Tabla `telegram_expense_drafts` con TTL. (Alternativa más simple, en memoria, descartada: no sobrevive reinicios.) |
| Migraciones | Archivo SQL en `SQL/migrations/` + actualización de `SQL/schema.sql`. Sin runner automático (igual que el resto del repo). |

---

## 3. Arquitectura y capas

```text
Telegram
  |
  v
Cloudflare Tunnel  (solo /api/telegram/webhook)
  |
  v
GastosApp.API
  +-- TelegramWebhookController        (único endpoint anónimo)
  +-- TelegramUpdateService            (idempotencia + rate limit + respuesta)
  +-- TelegramMessageRouter            (orquestador: comandos vs texto libre)
  +-- TelegramCommandParser            (comandos manuales deterministas)
  +-- TelegramExpenseService           (comandos + borrador/confirmación/catálogos)
  +-- TelegramQueryService             (consulta NL solo lectura, envuelve al agente)
  +-- ExpenseAgentService              (lectura NL, ya existente, sin cambios de tools)
  |
  +--> GastosApp.AI                    (biblioteca: extracción de intención, sin DB)
  |
  v
GastosApp.BusinessLogic
  +-- ITelegramIdentityService         (nuevo)
  +-- IExpenseDraftService             (nuevo)
  +-- ITelegramUpdateLedger            (nuevo)
  +-- ITransactionService              (existente, autoridad de escritura)
  +-- IAccountService / ICategoryService / ISubcategoryService / IMerchantService  (resolución nombre→ID)
  |
  v
PostgreSQL
```

Reglas de dependencia (obligatorias, verificables por revisión de `.csproj`):

- `GastosApp.AI` **no** referencia `GastosApp.BusinessLogic` ni `GastosApp.Models` ni EF Core. Solo `Microsoft.Extensions.AI`, `Microsoft.Extensions.AI.OpenAI`, `Microsoft.Extensions.Options`.
- `GastosApp.API` referencia `GastosApp.AI` + `GastosApp.BusinessLogic`.
- El API **no** ejecuta SQL directo ni toca `ContextSqlGastos` para escrituras; siempre pasa por servicios de BusinessLogic.

### 3.1 Cambios de proyecto

| Proyecto | Cambio |
|---|---|
| `GastosApp.AI` | **Nuevo**: `GastosApp.AI/GastosApp.AI.csproj` (`net9.0`), `Intent/*`, `Configuration/LlmOptions.cs`. |
| `code.sln` | Agregar `GastosApp.AI` con su GUID. |
| `GastosApp.API` | `ProjectReference` a `GastosApp.AI`. Registrar servicios AI en `Extensions/ServiceCollectionExtensions.cs`. |
| `GastosApp.Models` | Nuevas entidades `TelegramIdentity`, `TelegramExpenseDraft`, `TelegramProcessedUpdate`. |
| `GastosApp.BusinessLogic` | `DbSet`s + `OnModelCreating` en `Context/ContextSqlGastos.cs`; nuevas interfaces en `Interfaces/`; implementaciones en `Services/`. |
| `SQL` | Nueva migración + `schema.sql` actualizado. |

`LlmOptions` se mueve a `GastosApp.AI/Configuration/LlmOptions.cs` (namespace `GastosApp.AI.Configuration`). `ExpenseAgentService` y `TelegramConfigurationExtensions` solo ajustan el `using`; el binding y las validaciones de arranque se mantienen.

---

## 4. Contrato de `GastosApp.AI` (IA solo intención)

```csharp
namespace GastosApp.AI.Intent;

public enum IntentKind { RegistrarGasto, Consulta, Desconocido }

public sealed record IntentRequest(
    string Texto,
    DateTimeOffset Ahora,
    string ZonaHoraria,
    IReadOnlyList<string> Cuentas,
    IReadOnlyList<string> Categorias);

public sealed record IntentResult(
    IntentKind Kind,
    decimal? Monto,
    string? Cuenta,
    string? Categoria,
    DateOnly? Fecha,
    string? Descripcion,
    string? PreguntaAclaratoria);

public interface IExpenseIntentExtractor
{
    Task<IntentResult> ExtractAsync(IntentRequest request, CancellationToken cancellationToken);
}
```

Reglas del contrato:

- Una sola llamada al LLM, **sin tools registradas**, salida JSON validada contra `IntentResult`.
- Si el modelo no soporta modo JSON estructurado, se usa prompt estricto + parseo tolerante y, ante cualquier duda, `IntentKind.Desconocido`.
- `IntentRequest` recibe solo **nombres** de catálogos (máx. 50 por lista), nunca IDs.
- `IntentResult` no incluye `userId`, `accountId`, `transactionId` ni ninguna capacidad de escritura.
- Toda salida se revalida en el API: monto > 0, fecha parseable y dentro de rango razonable, nombres resolubles. Si algo falla → pregunta de aclaración, sin borrador.

---

## 5. Modelo de datos y migraciones

Migración: `SQL/migrations/2026-09-16_telegram_identity_drafts_idempotency.sql` (mismo estilo `YYYY-MM-DD_descripcion.sql` del repo). Se refleja además en `SQL/schema.sql` para instalaciones nuevas. Aplicación manual, como el resto de migraciones.

### 5.1 `telegram_identities` (permanente)

| Columna | Tipo | Notas |
|---|---|---|
| `telegram_identity_id` | `SERIAL PK` | |
| `telegram_user_id` | `BIGINT NOT NULL` | `UNIQUE` |
| `telegram_chat_id` | `BIGINT NOT NULL` | |
| `user_id` | `INT NOT NULL` | FK `users(user_id)` `ON DELETE CASCADE` |
| `active` | `BOOLEAN NOT NULL DEFAULT TRUE` | |
| `created_at/updated_at/created_by/updated_by` | igual que el resto | auditoría vía `BaseModel` |

Índices: `UNIQUE (telegram_user_id)`, `(user_id, active)`.

### 5.2 `telegram_expense_drafts` (borrador con TTL)

| Columna | Tipo | Notas |
|---|---|---|
| `draft_id` | `UUID PK` | |
| `telegram_identity_id` | `INT NOT NULL` | FK `telegram_identities` |
| `chat_id` | `BIGINT NOT NULL` | |
| `status` | `VARCHAR(20) NOT NULL` | `pending` \| `confirmed` \| `cancelled` \| `expired` |
| `intent` | `VARCHAR(20) NOT NULL` | `expense` |
| `amount` | `NUMERIC(15,2) NOT NULL` | |
| `transaction_date` | `TIMESTAMPTZ NOT NULL` | UTC |
| `account_id` / `category_id` / `subcategory_id` / `merchant_id` | `INT NULL` | resueltos en código |
| `raw_account_name` / `raw_category_name` / `raw_subcategory_name` / `raw_merchant_name` | `VARCHAR(150) NULL` | para mostrar y re-resolver |
| `description` | `VARCHAR(500) NULL` | |
| `source` | `VARCHAR(20) NOT NULL` | `manual` \| `ai` |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | TTL (propuesto: 15 min) |
| `created_at` / `confirmed_at` | `TIMESTAMPTZ` | |
| `transaction_id` | `INT NULL` | FK `transactions(transaction_id)` |

Índices: `UNIQUE (chat_id) WHERE status = 'pending'` (un solo borrador pendiente por chat), `(expires_at)`, `(telegram_identity_id, status)`.

### 5.3 `telegram_processed_updates` (idempotencia durable)

| Columna | Tipo | Notas |
|---|---|---|
| `update_id` | `BIGINT PK` | |
| `telegram_identity_id` | `INT NULL` | |
| `status` | `VARCHAR(20) NOT NULL` | `processing` \| `done` \| `failed` |
| `processed_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

Reclamo atómico: `INSERT ... ON CONFLICT (update_id) DO NOTHING`. Si no inserta fila → update duplicado → `200` sin efecto. Al terminar se marca `done`/`failed`. Los `failed` pueden reprocesarse; los `done` nunca. Retención: purga de filas con `processed_at` antiguo (propuesto: 7 días) al arrancar o en job ligero.

---

## 6. Flujo conversacional y secuencia

### 6.1 Secuencia de escritura (camino feliz)

```text
1. Telegram  -> POST /api/telegram/webhook            (secret header válido)
2. Controller: update válido, texto presente, identidad activa en DB -> si no: 403/404
3. TelegramUpdateService: reclama update_id en telegram_processed_updates
      - duplicado -> 200, fin
4. Router:
      - mensaje empieza con "/" -> comando manual
      - texto libre             -> IExpenseIntentExtractor (puede no estar disponible -> mensaje genérico)
5. Borrador:
      - valida monto > 0, fecha (America/Mexico_City), resuelve cuenta/categoría a IDs vía BusinessLogic
      - persiste telegram_expense_drafts (status=pending, source=manual|ai, expires_at=now+TTL)
      - responde resumen + "responde sí para confirmar, no para cancelar"
      - NO se toca la tabla transactions
6. Confirmación ("sí" / /confirmar):
      - carga borrador pendiente del chat, verifica TTL y estado
      - construye `Transaction` y llama `ITransactionService.CreateExpenseAsync`
      - marca borrador `confirmed` + `transaction_id`
      - responde "Gasto registrado: $X en <cuenta>"
7. Cancelación ("no" / /cancelar): marca cancelled, responde sin tocar transactions
```

### 6.2 Atomicidad y errores

- El borrador se marca `confirmed` **solo después** de que `CreateExpenseAsync` retorna éxito.
- Si BusinessLogic lanza excepción de validación (`ArgumentException` y similares), se captura en el orquestador y se mapea a mensaje funcional; el borrador permanece `pending` para permitir corrección o cancelación.
- Fallo del LLM: no afecta a los comandos manuales; el texto libre responde mensaje genérico sin escribir.
- Fallo al enviar el mensaje a Telegram: el update ya está `done`; el reproceso de Telegram no duplica (idempotencia) y el borrador sigue pendiente si la confirmación no se procesó.

---

## 7. Comandos manuales (base determinista, sin IA)

| Comando | Efecto |
|---|---|
| `/ayuda` (y `/start`) | Lista de comandos y formato esperado. |
| `/gasto <monto> <cuenta> [descripción]` | Crea borrador `expense`. Si falta cuenta o es ambigua → pide aclaración. |
| `/confirmar` (alias `sí`, `si`) | Confirma el borrador pendiente del chat. |
| `/cancelar` (alias `no`) | Cancela el borrador pendiente. |
| `/pendiente` | Muestra el borrador pendiente (opcional, barato). |
| `/cuentas`, `/categorias` | Lista catálogos activos para resolución manual. |

Reglas:

- Los comandos **no** invocan IA. Deben funcionar con el proveedor LLM caído.
- Si no hay borrador pendiente, `sí`/`no` no hacen nada destructivo: responden que no hay nada pendiente.
- El parseo de monto acepta `200`, `200.50`, `$200`. La fecha por defecto es hoy en `America/Mexico_City`.

---

## 8. Extracción IA (posterior a los comandos)

1. El texto libre que **no** es comando va a `IExpenseIntentExtractor`.
2. `RegistrarGasto` → mismo camino que los comandos manuales (`source = ai`).
3. `Consulta` → se delega al `ExpenseAgentService` existente (solo lectura, 3 tools ya implementadas).
4. `Desconocido` o datos incompletos → pregunta de aclaración; **no** se crea borrador.
5. Atajos de confirmación: si el texto es `sí`/`no` y existe borrador pendiente, se actúa **antes** de llamar al LLM (evita gastar tokens y latencia).

---

## 9. Endpoints mínimos

| Método | Ruta | Auth | Uso |
|---|---|---|---|
| `POST` | `/api/telegram/webhook` | Anónimo + header secret + allowlist DB | Único punto de entrada del bot. |
| — | `/api/**` existentes | JWT `UserWithId` / `AdminWithId` | Sin cambios. |

- **No se agregan endpoints públicos nuevos.** Confirmar/cancelar ocurre por Telegram.
- No se expone nada del borrador por HTTP.
- Pendiente de verificación en ejecución: el `docker-compose.yml` publica `5000:8080`; debe endurecerse a `127.0.0.1:5000:8080` (o quitar `ports`) para que solo el túnel alcance el API.

---

## 10. Seguridad

| Control | Implementación |
|---|---|
| Autenticidad del webhook | Comparación de `X-Telegram-Bot-Api-Secret-Token` en tiempo constante (ya existe). |
| Autorización | `From.Id` debe existir y estar activo en `telegram_identities`; si no → `403`. `Telegram__Enabled=false` → `404`. |
| Aislamiento de datos | `userId` sale de la identidad persistida, nunca del mensaje ni del LLM. Ninguna tool acepta `userId`. |
| Sin escritura por IA | No hay `AIFunction` de escritura registrada. La IA devuelve un DTO; el API decide y BusinessLogic persiste. |
| Confirmación obligatoria | Sin borrador `pending` vigente no hay escritura posible. |
| Anti duplicado | `telegram_processed_updates` (durable) + único borrador `pending` por chat. |
| TTL de borrador | `expires_at` verificado antes de confirmar; expirado → `expired`, sin escritura. |
| Validación final | `ITransactionService` valida monto > 0, pertenencia de la cuenta (`account.UserId != userId` → error) y dimensiones analíticas. |
| Rate limit | Límite simple en memoria por identidad/chat; excedido → mensaje de espera. `ponytail:` límite por proceso, sustituible por almacén distribuido si se escala a varias réplicas. |
| Logs | Se registran `update_id`, identidad y resultado. Nunca token del bot, API key, prompts completos, montos ni cuerpos de mensaje en nivel informativo. |
| Inyección de prompt | Los resultados de tools y textos de DB se declaran como datos; el modelo nunca emite instrucciones ejecutables porque no tiene tools de escritura. |
| Secretos | Solo por variables de entorno (`Telegram__*`, `Llm__*`). Ningún valor real en Git, docs ni logs. |

---

## 11. Exclusiones de Fase 1

- Transferencias entre cuentas, MSI, pagos de crédito, asignaciones/divisiones de gasto.
- Edición o borrado de movimientos por Telegram.
- Fotos, tickets, OCR, notas de voz.
- Presupuestos, recurrentes, alertas, reportes programados.
- Múltiples usuarios autorizados en operación (la tabla queda lista, se usa una fila).
- Panel web, endpoint admin o API pública del borrador.
- Dify, n8n, colas distribuidas, Redis, microservicio de IA.
- Cambios al flujo de autenticación JWT del API o al BFF del frontend.

---

## 12. Entregas ordenadas

Cada entrega cierra con build verde (`dotnet build code.sln`) y la validación indicada. No se avanza con build roto.

### E0 — Preflight (solo verificación, sin cambios de código)

- Confirmar que el `AppUserId`/identidad objetivo corresponde a un usuario existente y activo.
- Confirmar que el proveedor LLM soporta salida JSON estructurada; si no, registrar la estrategia de parseo tolerante.
- Confirmar binding efectivo del puerto del API y alcance del túnel (solo `/api/telegram/webhook`).
- Acordar TTL de borrador y límite de rate.

**DoD:** checklist de E0 completado y anotado, sin modificar el repo.

### E1 — Esquema y persistencia

- Migración SQL (3 tablas + índices) y actualización de `schema.sql`.
- Entidades en `GastosApp.Models/Entities`, `DbSet`s y `OnModelCreating` en `ContextSqlGastos`.
- `ITelegramIdentityService`, `IExpenseDraftService`, `ITelegramUpdateLedger` (+ impls) y su registro en `ServiceCollectionExtensions`.

**DoD:** `dotnet build code.sln` verde; migración aplicada en una DB de prueba; consultas básicas de alta/lectura verificadas.

### E2 — Identidad persistente e idempotencia durable

- Resolución de identidad por `telegram_user_id` (con siembra desde configuración si la tabla está vacía).
- Reemplazo del `ConcurrentDictionary` por el reclamo atómico en `telegram_processed_updates`.
- Purga de updates antiguos.

**DoD:** update duplicado → una sola ejecución; usuario no autorizado → `403` sin efectos.

### E3 — Comandos manuales y confirmación (sin IA)

- `TelegramCommandParser` + `TelegramExpenseService`.
- `/gasto`, `/confirmar`, `/cancelar`, `/pendiente`, `/ayuda`, catálogos.
- Escritura exclusivamente vía `ITransactionService`.

**DoD:** criterios de aceptación de la sección 14 en verde para comandos manuales; `transactions` sin cambios antes de confirmar.

### E4 — Biblioteca `GastosApp.AI` y extracción de intención

- Nuevo proyecto `GastosApp.AI` + `code.sln` + referencia desde el API.
- `IExpenseIntentExtractor` con salida JSON validada; reutilización de `LlmOptions`.
- Free text → borrador; `Consulta` → `ExpenseAgentService`; `Desconocido` → aclaración.
- Atajos `sí`/`no` resueltos antes del LLM.

**DoD:** "gasté 200 en comida ayer" crea borrador con fecha correcta y no escribe hasta confirmar; LLM caído no rompe comandos manuales.

### E5 — Endurecimiento, validación y documentación

- Rate limit, purga, mensajes de error sin detalles internos.
- Script de humo `scripts/smoke-telegram-fase1.sh` (curl + `docker compose exec`) cubriendo la matriz de aceptación.
- Actualización de `TELEGRAM_BOT.md` (comandos y flujo de borrador) y nota en `docs/`.
- Revisión de logs: sin secretos ni datos financieros innecesarios.

**DoD:** script ejecutado con resultado registrado; documentación actualizada.

---

## 13. Validación

### 13.1 Build y ejecución

```bash
dotnet restore code.sln
dotnet build code.sln
dotnet run --project GastosApp.API/GastosApp.API.csproj      # local
docker compose up -d --build                                  # stack
```

Nota: el repo **no tiene proyectos de prueba**. La verificación se hace con el script de humo de E5, consultas SQL y la matriz de aceptación.

### 13.2 Script de humo (mínimo verificable)

Debe: enviar updates simulados al webhook con el header secret, comprobar respuestas y contar filas en `transactions` / `telegram_expense_drafts` / `telegram_processed_updates` antes y después de cada caso. Se ejecuta contra el API local; no requiere Telegram real.

### 13.3 Verificaciones por área

- **Webhook:** secret ausente/incorrecto → `401`; identidad ajena → `403`; `Enabled=false` → `404`; update duplicado → sin efecto.
- **Borrador:** creación sin escribir; único pendiente por chat; expiración respetada.
- **Escritura:** una sola transacción por confirmación; monto, cuenta, tipo y fecha correctos; comparar contra la API autenticada y el dashboard.
- **IA:** intención correcta en frases simples; ambigüedad → aclaración; nunca IDs desde el modelo.
- **Logs:** búsqueda de tokens/API keys/montos en logs → sin coincidencias.

---

## 14. Criterios de aceptación

1. `/gasto 200 efectivo` crea borrador `pending` y **no** inserta filas en `transactions`.
2. Enviar `sí` confirma y crea **exactamente una** transacción con monto 200 y tipo `expense`.
3. Enviar `no` cancela el borrador sin tocar `transactions`.
4. Confirmar un borrador expirado no escribe y responde indicando expiración.
5. Reenviar el mismo `update_id` no duplica borrador ni transacción.
6. Un `From.Id` no autorizado recibe `403` y no filtra datos.
7. Webhook con secret incorrecto o ausente → `401`.
8. "gasté 200 en comida ayer" (texto libre) crea borrador con la fecha de ayer en `America/Mexico_City`, sin escribir hasta confirmar.
9. Con el proveedor LLM caído, los comandos manuales siguen funcionando.
10. Monto `0` o cuenta inexistente → mensaje funcional, sin escritura.
11. Ningún registro de log contiene token, API key, valores de configuración ni cuerpos de mensaje.
12. `dotnet build code.sln` termina sin errores.

---

## 15. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Doble escritura por reintento de Telegram | Reclamo durable en `telegram_processed_updates` + borrador único pendiente. |
| Confirmación ambigua del borrador equivocado | Un solo `pending` por chat + `/pendiente` para revisar antes de confirmar. |
| IA alucina monto/fecha/cuenta | Revalidación en API + autoridad final de `ITransactionService`; sin tools de escritura. |
| LLM lento o no disponible | Comandos manuales como camino primario; timeout y mensaje genérico. |
| Fuga de datos entre usuarios | Identidad persistida + `userId` fijo desde DB; `userId` nunca es parámetro. |
| API expuesto por puerto Docker | Bind `127.0.0.1:5000:8080` o quitar `ports`; solo el túnel publica el webhook. |
| Proceso reiniciado pierde estado | Borrador e idempotencia en Postgres, no en memoria. |
| Prompt injection desde descripciones de comercio | Prompt declara datos, no instrucciones; el modelo no tiene tools de escritura. |

---

## 16. Pendientes de verificación en ejecución (no asumidos)

- Binding real del puerto del API y alcance efectivo del túnel (solo `/api/telegram/webhook`, resto `404`).
- Existencia y estado activo del usuario/identidad objetivo en la base de datos.
- Soporte real de salida JSON estructurada por el modelo elegido.
- Comportamiento de reintentos de Telegram observado en `telegram_processed_updates` durante la validación.
