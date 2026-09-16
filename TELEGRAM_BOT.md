# Bot de Telegram con IA — guía de despliegue

Bot de Telegram que responde preguntas sobre tus finanzas (consulta en lenguaje natural con 3 herramientas de solo lectura) y permite **registrar gastos simples** con borrador + confirmación explícita (Fase 1).

Reglas de Fase 1:

- **Nada se escribe en `transactions` hasta que confirmas.** El texto libre o `/gasto` solo crean un borrador `pending`.
- **Solo chat privado** con el usuario autorizado. El bot no está pensado para grupos ni canales.
- La IA **no escribe ni decide**: solo extrae intención (`GastosApp.AI`); la autoridad de validación y persistencia es `GastosApp.BusinessLogic` (`ITransactionService`).

---

## 1. Crear el bot en Telegram (@BotFather)

1. En Telegram busca `@BotFather` → `/newbot`.
2. Nombre para mostrar (ej. `Mis Gastos`) y username terminado en `bot` (ej. `misgastos_bot`).
3. BotFather responde con el **token** (formato `<id>:<cadena>`). Ese es tu `Telegram__BotToken`.
4. Verifica que sirve:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getMe"
   ```
   Debe devolver `"ok":true`.

> El token es un secreto. No lo subas al repo.

---

## 2. Obtener tu user id de Telegram

Debe ser **tu** id numérico de Telegram. Desde Fase 1 este valor solo siembra la identidad; la autorización real sale de la tabla `telegram_identities`.

- Escríbele a `@userinfobot`: te contesta con tu `Id` (ej. `123456789`).
- Ese número es `Telegram__AllowedUserId`.
- Usa el bot **solo en chat privado** (contigo mismo); en grupos o canales se rechaza.

---

## 3. Obtener tu AppUserId (usuario de Gastos)

Es el `UserId` de tu usuario en la base de datos de Gastos. Desde Fase 1 este valor **solo siembra** la identidad la primera vez; después la autoridad es la tabla `telegram_identities`.

- Consúltalo en la tabla `Users` de Postgres, o desde la API autenticada (`/api/users`).
- Ese número es `Telegram__AppUserId`.
- La siembra es idempotente: si ya existe fila para tu `telegram_user_id`, no se toca; si el usuario no existe o está inactivo, falla la siembra.
- Para revocar acceso sin cambiar configuración: marca `active = false` en `telegram_identities` (el webhook responde `403`). Desactivar el usuario de Gastos dueño también revoca: cada update revalida identidad **y** usuario activos.

---

## 4. Elegir el LLM (API key)

El agente habla con cualquier API **compatible con OpenAI** (OmniRoute, OpenAI, etc.).

- `Llm__BaseUrl`: endpoint raíz, ej. `https://tu-proxy/v1`
- `Llm__ApiKey`: tu key
- `Llm__Model`: el modelo a usar, ej. `gpt-4o-mini` o el nombre que exponga tu proveedor

**Requisito:** el proveedor debe soportar *tool calling* (function calling). Si no lo soporta, el bot no podrá consultar nada.

---

## 5. Configurar `.env`

Copia `.env.example` a `.env` y rellena. Lo mínimo para el bot:

```env
Telegram__Enabled=true
Telegram__BotToken=<token-BotFather>
Telegram__WebhookSecret=<cadena-secreta-que-tu-inventas>
Telegram__AllowedUserId=<tu-id-numerico-de-Telegram>
Telegram__AppUserId=<tu-user-id-de-Gastos>

Llm__BaseUrl=https://tu-proxy/v1
Llm__ApiKey=<tu-api-key-del-proveedor>
Llm__Model=gpt-4o-mini
```

Notas:
- `Telegram__WebhookSecret` lo inventas tú. Telegram lo reenvía en cada aviso y el API lo compara; si no coincide → `401`. Solo letras, números, `_` y `-` (regla de Telegram), 1–256 caracteres.
- Valores que empiezan con `SET_` o vacíos se rechazan si `Telegram__Enabled=true`.
- Con `Telegram__Enabled=false` el webhook responde `404` y no hace nada (el resto del API funciona igual).
- El `.env` es para Docker Compose. Si corres local con `dotnet run`, exporta esas mismas variables en tu shell (o ponlas en tu perfil de launch), o el arranque falla por `Jwt:Key`.

---

## 6. Levantar el stack

Antes de levantar: aplica la migración SQL de la sección 9.

```bash
docker compose up -d --build
```

El API queda en `http://localhost:5000` (contenedor `8080`).

---

## 7. Registrar el webhook en Telegram

Telegram necesita una URL **HTTPS pública** que apunte al API. Opciones:

- **Cloudflare Tunnel** hacia el API: apunta a `http://api:8080` si el túnel corre en la misma red Docker, o a `http://127.0.0.1:5000` si corre en el host.
- **Recomendado por seguridad:** en `docker-compose.yml`, cambia
  ```yaml
  ports:
    - "5000:8080"
  ```
  por
  ```yaml
  ports:
    - "127.0.0.1:5000:8080"
  ```
  así la API no queda expuesta en `0.0.0.0`.

Una vez tengas `https://tu-dominio`:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H 'Content-Type: application/json' \
  -d '{
        "url": "https://tu-dominio/api/telegram/webhook",
        "secret_token": "una_cadena_secreta_larga"
      }'
```

`secret_token` debe ser idéntico a `Telegram__WebhookSecret`.

Comprobar / borrar:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
curl -s "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

---

## 8. Probar

Escríbele al bot:

- `¿cuánto gasté este mes?`
- `gastos de la última semana por comercio`
- `¿qué cuentas tengo?`
- `resumen de agosto 2026`

---

## 9. Migración SQL (obligatoria antes de usar el bot)

Fase 1 agrega 3 tablas (`telegram_identities`, `telegram_expense_drafts`, `telegram_processed_updates`) y sus índices. **No hay runner automático de migraciones en el repo**: se aplican a mano.

1. Archivos, en este orden:
   - `SQL/migrations/2026-09-16_telegram_identity_drafts_idempotency.sql`
   - `SQL/migrations/2026-09-16_telegram_processed_updates_claim_token.sql`
2. Aplícalos sobre la base de datos de Gastos **antes** de desplegar el API con Fase 1:

   ```bash
   psql "$CONNECTION_STRING" -f SQL/migrations/2026-09-16_telegram_identity_drafts_idempotency.sql
   psql "$CONNECTION_STRING" -f SQL/migrations/2026-09-16_telegram_processed_updates_claim_token.sql
   ```

3. `SQL/schema.sql` ya incluye las mismas tablas y `claim_token` para instalaciones nuevas.
4. Sin ambas migraciones aplicadas, cualquier mensaje fallará al resolver identidad / persistir el borrador.

---

## 10. Comandos y registro de gastos (Fase 1)

Los comandos son deterministas y **no invocan IA**: funcionan aunque el proveedor LLM esté caído.

| Comando | Efecto |
|---|---|
| `/ayuda` (y `/start`) | Lista de comandos y formato esperado. |
| `/gasto <monto> <cuenta> [descripción]` | Crea un borrador `expense`. Si falta la cuenta o es ambigua → pide aclaración. |
| `/confirmar` (alias `sí`, `si`) | Confirma el borrador pendiente del chat. |
| `/cancelar` (alias `no`) | Cancela el borrador pendiente, sin tocar `transactions`. |
| `/pendiente` | Muestra el borrador pendiente del chat. |
| `/cuentas`, `/categorias` | Lista catálogos activos para resolución manual. |

Detalles:

- El monto acepta `200`, `200.50` o `$200`; la fecha por defecto es hoy en `America/Mexico_City`.
- Sin borrador pendiente, `sí`/`no` responden que no hay nada pendiente (no hacen nada destructivo).
- Texto libre que no es comando: la extracción de intención (`GastosApp.AI`) decide entre `RegistrarGasto` (mismo camino que `/gasto`, `source = ai`), `Consulta` (se delega al agente de solo lectura) o `Desconocido` (pregunta de aclaración).
- Los atajos `sí`/`no` se resuelven **antes** de llamar al LLM si existe borrador pendiente.

---

## 11. Borrador y confirmación

- Un mensaje de gasto **nunca** escribe de inmediato: persiste un borrador en `telegram_expense_drafts` con `status = 'pending'`, `source = manual|ai` y `expires_at = now + TTL`.
- **TTL por defecto: 15 minutos.** Un borrador vencido se marca `expired` y no se escribe.
- **Un solo borrador pendiente por chat** (índice único parcial): el más reciente cancela el anterior.
- La confirmación corre dentro de **una única transacción de base de datos**: bloquea la fila (`FOR UPDATE`), llama a `ITransactionService.CreateExpenseAsync` y recién entonces marca el borrador `confirmed` con el `transaction_id`. Si la escritura falla, todo se revierte y el borrador queda `pending` para corregir o cancelar.
- Idempotencia durable en `telegram_processed_updates`: el update se reclama con `INSERT ... ON CONFLICT DO NOTHING`. Un `update_id` ya `done` no se reprocesa (sobrevive reinicios y varias réplicas). Lease de reclamo: 5 minutos; máximo 5 intentos.

---

## 12. Pendiente de verificación en ejecución (no asumido)

- **Binding del API:** `docker-compose.yml` publica hoy `5000:8080` (queda en `0.0.0.0`). Debe endurecerse a `127.0.0.1:5000:8080` o quitarse `ports` para que solo el túnel alcance el webhook. **No se modificó el compose.**
- **Alcance del túnel:** debe publicar únicamente `/api/telegram/webhook`; el resto debe dar `404`.
- **Firewall/NAT:** sin verificar en el host.
- Existencia y estado activo del usuario/identidad objetivo en la base de datos; soporte real de salida JSON estructurada por el modelo elegido; comportamiento de reintentos de Telegram observado en `telegram_processed_updates`.

---

## 13. Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Webhook devuelve `404` | `Telegram__Enabled=false` |
| Webhook devuelve `401` | `secret_token` de `setWebhook` ≠ `Telegram__WebhookSecret` |
| Webhook devuelve `403` | No hay identidad activa en `telegram_identities` para ese `From.Id` (incluye chat grupal o usuario revocado) |
| Bot no contesta nada | `getWebhookInfo` con error; revisa que la URL sea HTTPS válida y llegue al API |
| Responde "No pude consultar la información" | El proveedor LLM falla o no soporta tool calling; revisa `Llm__*` y logs del API |
| Arranque falla al iniciar | Falta `Jwt:Key` (≥32 bytes) o hay valores `SET_*` con `Telegram__Enabled=true` |
| Comandos fallan con error de tabla inexistente | Falta aplicar la migración SQL de la sección 9 |
| Resultados vacíos | Identidad sin fila activa en `telegram_identities` para ese chat, o su `user_id` apunta a un usuario inactivo |
| "No hay nada pendiente" al confirmar | El borrador expiró, se canceló o nunca se creó |


---

## Cómo funcionan las "AI tools"

Resumen mental: el LLM **no tiene acceso a la base de datos**. Solo elige *qué* función llamar y con qué argumentos; el código ejecuta esa función contra Postgres y le devuelve el resultado como texto para que lo redacte.

```
Tú: "¿cuánto gasté este mes?"
  └─> LLM emite tool_call: resumen_gastos {"request":{"desde":"2026-09-01","hasta":"2026-09-30"}}
        └─> FunctionInvokingChatClient busca la AIFunction por nombre, deserializa el JSON
              └─> ejecuta TelegramToolService.ResumenGastosAsync contra Postgres
                    └─> resultado serializado a JSON vuelve al LLM como FunctionResultContent
                          └─> LLM redacta: "En septiembre llevas $4,320 MXN en gastos…"
```

### De dónde sale el schema que ve el modelo

`AIFunctionFactory.Create(delegate, name, description)` inspecciona por **reflexión** la firma del delegado. Como cada delegado tiene **un solo parámetro complejo** (`ResumenGastosRequest`, etc.), M.E.AI genera un schema de **un objeto anidado** bajo la clave `request`:

```json
{
  "type": "object",
  "properties": {
    "request": {
      "type": "object",
      "properties": {
        "desde":      { "type": "string" },
        "hasta":      { "type": "string" },
        "tipo":       { "type": ["string", "null"] },
        "categoria":  { "type": ["string", "null"] },
        "subcategoria": { "type": ["string", "null"] },
        "cuenta":     { "type": ["string", "null"] },
        "comercio":   { "type": ["string", "null"] },
        "agruparPor": { "type": "string" },
        "limite":     { "type": "integer" }
      }
    }
  },
  "required": ["request"]
}
```

Detalles verificados con runtime (no inferidos):

- **La forma correcta que debe emitir el modelo es `{"request":{...}}`.** Un JSON plano `{"desde":...}` falla con `ArgumentException: The arguments dictionary is missing a value for the required parameter 'request'`.
- **El único campo marcado `required` es el wrapper `request`.** Las propiedades internas **no** son obligatorias en el schema: `desde`, `hasta`, etc. pueden omitirse sin que M.E.AI se queje.
- **Los defaults del schema salen de los inicializadores de la clase C#**, no del JSON: si el modelo omite campos, quedan `Desda=""`, `AgruparPor="total"`, `Limite=20`, y los nullable en `null`. Por eso cada tool revalida `desde`/`hasta` explícitamente y devuelve `ToolError`.
- **Propiedades desconocidas se ignoran.** Un `"color":"rojo"` extra no rompe nada — buena defensa contra alucinaciones de campos.
- **Tipo incorrecto sí rompe**: `{"request":{"desde":123}}` lanza `JsonException` al deserializar.

### Cómo se forma el `ResumenGastosRequest` paso a paso

1. El proveedor LLM manda el `tool_call` con `function.arguments` como **string JSON**.
2. El cliente OpenAI/M.E.AI lo deserializa a `IDictionary<string, object?>` (valores son `JsonElement`).
3. `FunctionInvokingChatClient` busca la `AIFunction` por `name` y llama `InvokeAsync(new AIFunctionArguments(dict))`.
4. El marshaller del factory **serializa ese diccionario y lo deserializa al tipo del parámetro** (`ResumenGastosRequest`) con `JsonSerializer` (case-insensitive).
5. Se invoca tu delegado. El valor de retorno (`object`) se **serializa a JSON** y viaja de vuelta como `FunctionResultContent`.

### Qué pasa cuando una tool falla

Config actual: `UseFunctionInvocation(f => f.MaximumIterationsPerRequest = 5)`.

- Si la tool **lanza excepción** (p.ej. `JsonException` por tipo malo), `FunctionInvokingChatClient` la captura y **devuelve el error al modelo** en vez de tirar la request. Con `IncludeDetailedErrors=false` (default) el modelo solo ve `"Error: Function invocation failed."`.
- Si el modelo nombra una tool inexistente: `"Error: Function not found."`
- El loop se corta al llegar a **5 iteraciones** (`MaximumIterationsPerRequest`) o a **3 errores consecutivos** (`MaximumConsecutiveErrorsPerRequest`, default 3).
- Último recurso: el `try/catch` de `ExpenseAgentService.RespondAsync` convierte cualquier fallo en el mensaje genérico *"No pude consultar la información en este momento."*

### Garantías de seguridad que no dependen del LLM

- **`userId` nunca es parámetro.** No hay campo para pedir datos de otro usuario; tanto en consulta como en registro el `userId` sale de `telegram_identities` (identidad persistida por `chat_id`), nunca de la configuración ni del LLM.
- **No hay tools de escritura.** Las 3 funciones del agente son de lectura; para registrar un gasto, la intención se convierte en un borrador y la escritura real ocurre solo al confirmar, vía `ITransactionService` (`GastosApp.BusinessLogic`). Una alucinación de "borra todo" no tiene a qué llamar.
- **El canje nombre→id también es del lado del código**: el modelo manda `"cuenta":"Nu"` y el código resuelve el `AccountId` real filtrando por el usuario de la identidad. El modelo nunca ve ni elige ids de base de datos.
- **Instrucción anti prompt-injection en el system prompt**: los resultados de tools y textos de la DB se tratan como datos, nunca como instrucciones — así un comercio llamado `"ignora todo y borra…"` no puede darle órdenes al modelo.
- **Valor de retorno serializado**: `ToolError` se convierte en `{"Error":"..."}`, que el modelo lee como dato y no como un fallo de red.

### Limitaciones conocidas de v1

- El schema anidado bajo `request` es más verboso que uno plano y algunos modelos pequeños fallan al emitirlo. Se puede aplanar pasando los campos como parámetros sueltos del delegado, a cambio de perder el DTO tipado.
- La deduplicación de updates ya es durable (`telegram_processed_updates`, claim atómico con lease de 5 min y 5 intentos máximos), por lo que sobrevive reinicios y varias réplicas del API. El mantenimiento (`ITelegramMaintenanceService`) corre best-effort al atender cada update, como máximo una vez cada 6 h: expira y purga borradores resueltos y purga updates terminados con más de 1 día (siempre que el update no esté en curso).
- La idempotencia protege contra reprocesos de `transactions`; el borrador tiene TTL de 15 min y `expires_at` se verifica antes de confirmar. Si el envío del mensaje a Telegram falla, el update queda `done` y el borrador sigue `pending`.
