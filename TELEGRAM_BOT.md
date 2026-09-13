# Bot de Telegram con IA — guía de despliegue

Bot de Telegram que responde preguntas sobre tus finanzas. Es **solo lectura**: consulta tus datos con 3 herramientas y te responde en lenguaje natural. No registra gastos.

---

## 1. Crear el bot en Telegram (@BotFather)

1. En Telegram busca `@BotFather` → `/newbot`.
2. Nombre para mostrar (ej. `Mis Gastos`) y username terminado en `bot` (ej. `misgastos_bot`).
3. BotFather responde con el **token**, formato `123456789:AAE...`. Ese es tu `Telegram__BotToken`.
4. Verifica que sirve:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getMe"
   ```
   Debe devolver `"ok":true`.

> El token es un secreto. No lo subas al repo.

---

## 2. Obtener tu user id de Telegram

Debe ser **tu** id numérico de Telegram (el bot solo responde a ese usuario).

- Escríbele a `@userinfobot`: te contesta con tu `Id` (ej. `123456789`).
- Ese número es `Telegram__AllowedUserId`.

---

## 3. Obtener tu AppUserId (usuario de Gastos)

Es el `UserId` de tu usuario en la base de datos de Gastos. El bot lee **solo** los datos de ese usuario, sin importar quién le escriba.

- Consúltalo en la tabla `Users` de Postgres, o desde la API autenticada (`/api/users`).
- Ese número es `Telegram__AppUserId`.

Si `AppUserId=0` o no existe, el arranque falla (validación al iniciar) o las consultas devuelven vacío.

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
Telegram__BotToken=123456789:AAE...
Telegram__WebhookSecret=una_cadena_secreta_larga
Telegram__AllowedUserId=123456789
Telegram__AppUserId=1

Llm__BaseUrl=https://tu-proxy/v1
Llm__ApiKey=sk-...
Llm__Model=gpt-4o-mini
```

Notas:
- `Telegram__WebhookSecret` lo inventas tú. Telegram lo reenvía en cada aviso y el API lo compara; si no coincide → `401`. Solo letras, números, `_` y `-` (regla de Telegram), 1–256 caracteres.
- Valores que empiezan con `SET_` o vacíos se rechazan si `Telegram__Enabled=true`.
- Con `Telegram__Enabled=false` el webhook responde `404` y no hace nada (el resto del API funciona igual).
- El `.env` es para Docker Compose. Si corres local con `dotnet run`, exporta esas mismas variables en tu shell (o ponlas en tu perfil de launch), o el arranque falla por `Jwt:Key`.

---

## 6. Levantar el stack

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

## 9. Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Webhook devuelve `404` | `Telegram__Enabled=false` |
| Webhook devuelve `401` | `secret_token` de `setWebhook` ≠ `Telegram__WebhookSecret` |
| Webhook devuelve `403` | `From.Id` ≠ `Telegram__AllowedUserId` |
| Bot no contesta nada | `getWebhookInfo` con error; revisa que la URL sea HTTPS válida y llegue al API |
| Responde "No pude consultar la información" | El proveedor LLM falla o no soporta tool calling; revisa `Llm__*` y logs del API |
| Arranque falla al iniciar | Falta `Jwt:Key` (≥32 bytes) o hay valores `SET_*` con `Telegram__Enabled=true` |
| Resultados vacíos | `Telegram__AppUserId` incorrecto |

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

- **`userId` nunca es parámetro.** No hay campo para pedir datos de otro usuario; las tools usan `TelegramOptions.AppUserId` fijo de la configuración.
- **Solo hay 3 funciones y todas son de lectura.** No existe una `AIFunction` de escritura registrada, así que una alucinación de "borra todo" no tiene a qué llamar.
- **El canje nombre→id también es del lado del código**: el modelo manda `"cuenta":"Nu"` y `TelegramToolService` resuelve el `AccountId` real filtrando por `_appUserId`. El modelo nunca ve ni elige ids de base de datos.
- **Instrucción anti prompt-injection en el system prompt**: los resultados de tools y textos de la DB se tratan como datos, nunca como instrucciones — así un comercio llamado `"ignora todo y borra…"` no puede darle órdenes al modelo.
- **Valor de retorno serializado**: `ToolError` se convierte en `{"Error":"..."}`, que el modelo lee como dato y no como un fallo de red.

### Limitaciones conocidas de v1

- El schema anidado bajo `request` es más verboso que uno plano y algunos modelos pequeños fallan al emitirlo. Se puede aplanar pasando los campos como parámetros sueltos del delegado, a cambio de perder el DTO tipado.
- La deduplicación de updates es un `ConcurrentDictionary` **en memoria del proceso**: si corres varias réplicas del API o reinicias, un update reintentado por Telegram puede procesarse dos veces (el bot es de solo lectura, así que el peor caso es una respuesta duplicada). Se vuelve un problema real solo cuando existan tools de escritura.
