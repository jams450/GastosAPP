# Pendientes

Estado: el backend de la revisión de seguridad/optimización/arquitectura quedó cerrado y fusionado en `main`
(commit de merge `5bec35d`, sobre `dc3b4d5`). El registro técnico completo — especificaciones, tareas, decisiones
y evidencia — está en `odd/tasks/backend-hardening.md`; este documento es la lista viva de lo que sigue abierto.

**Nada de esta lista está hecho.** Cada entrada dice qué falta, por qué no se hizo y qué lo desbloquea.

---

## 1. Bloqueado por falta de base de datos

### P1 — T4: agregado por día/mes en SQL

**Qué**: los agregados por día y por mes se calculan trayendo filas y agrupando en memoria, en vez de agrupar en SQL.
**Por qué no se hizo**: el cambio reescribe una lectura de dinero en SQL específico de PostgreSQL (`AT TIME ZONE`
sobre `timestamptz`). Sin base de datos no hay forma de demostrar que los importes siguen siendo idénticos, y
enviar SQL de dinero sin verificar es exactamente el fallo que esta revisión buscaba evitar.
**Estado del código**: correcto; solo deja de escalar en rangos amplios.
**Desbloquea**: una PostgreSQL desechable (contenedor propio) o permiso para levantar el servicio `postgres` de
`docker-compose.yml`.

### P2 — T5: N+1 en los promedios de recurrentes

**Qué**: el cálculo de promedios recorre las plantillas y consulta una vez por cada una.
**Por qué no se hizo**: la afirmación es "menos viajes a la base de datos", y contarlos requiere un motor
relacional. Al releer el código, la ganancia real es N plantillas → una consulta por tipo (`Kind`), es decir 2 o 3
viajes en una corrida nocturna.
**Desbloquea**: lo mismo que P1, o aceptar explícitamente una variante reducida sin verificación contra base real.

---

## 2. Siguiente fase

### P3 — Revisión del frontend (`GastosApp.Web/`)

La petición original cubría front y back; el backend queda cerrado. Falta la revisión de
seguridad/optimización/arquitectura del frontend (App Router de Next.js, compilado por el servicio `frontend` de
`docker-compose.yml`; no está en `code.sln`).

**Aviso que ya afecta al frontend**: con la política de autorización por defecto (T7a), una ruta del API que no
existe ahora responde **401**, no 404. Si el frontend distingue "no existe" de "no autorizado" por el código
HTTP, hay que ajustarlo.

---

## 3. Bugs preexistentes encontrados durante el trabajo

No se corrigieron por estar fuera del alcance autorizado. Ninguno lo causó este trabajo.

### P4 — El documento OpenAPI de Development devuelve 500 y nunca funcionó

**Síntoma**: `GET /openapi/v1.json` en Development → 500.
**Causa exacta**: `Microsoft.AspNetCore.OpenApi` 9.0.4 lanza `System.InvalidOperationException: The node must be
of type 'JsonValue'` desde `JsonNodeSchemaExtensions.ApplyValidationAttributes`, alcanzado por
`OpenApiDocumentService.GetJsonRequestBody`.
**Disparador**: un tipo de valor **nullable** con atributo de validación produce un esquema `anyOf` en vez de un
escalar, y el aplicador de atributos lee un nodo que no es escalar. Casos reales en este repositorio:

- `GastosApp.API/Models/Transactions/UpdateTransactionRequest.cs` — `[Range(1, int.MaxValue)] public int? CategoryId`
- `GastosApp.API/Models/Transactions/UpdateTransferRequest.cs`
- `GastosApp.API/Models/Investments/InvestmentRequests.cs`

**Preexistente**: reproducido idéntico en `dc3b4d5` con un `dotnet run` real en Development.
**Arreglo propuesto**: un *schema transformer* que omita los atributos de validación cuando el nodo no es un
`JsonValue`, o subir el paquete por encima de 9.0.4.
**Trampa**: el endpoint devuelve 401 en cuanto existe política por defecto, así que el bug se esconde detrás de un
error de autorización. Una prueba que afirme 200 va a fallar; la afirmación honesta es "no bloqueado por
autorización", que es la que ya está en `GastosApp.Backend.Tests/DevelopmentEndpointTests.cs`.

### P5 — `ExceptionHandler` declara un content-type que no envía

**Dónde**: `GastosApp.API/ExceptionHandler.cs`.
**Qué**: fija `Response.ContentType = "application/problem+json"` y después llama a `WriteAsJsonAsync`, que
sobrescribe la cabecera con `application/json; charset=utf-8`. El 400 automático de MVC sí emite
`application/problem+json`, así que los dos caminos de error discrepan.
**Arreglo propuesto**: fijar el content-type después de escribir, o escribir con el serializador correcto.

---

## 4. Deuda técnica detectada

### P6 — El guardarraíl de alcance no cubre `GetByIdAsync`

`ScopingGuardrailScanner` solo inspecciona `_repository.Get<T>` y `_repository.GetTrack<T>`. La ruta
`GetByIdAsync<T>()` → `GastosApp.BusinessLogic/Services/Infrastructure/Repository.cs` →
`_context.Set<T>().FindAsync` no tiene predicado y le es **invisible**.

- Arranca en `AccountService.cs:17-19` y la alcanzan más de 20 sitios.
- Los llamadores que sí son seguros (`TransferService.cs:30-35`, `CreditLifecycleService.cs:47-55`) comparan
  `UserId` en memoria **después** de materializar la entidad.

Extenderlo necesita otra regla, porque no hay predicado que exigir. Sin esto, S6 ("un servicio nuevo ya no puede
olvidar el alcance por usuario") se cumple para la superficie `Get<T>()` y **no** para la superficie
`GetByIdAsync`.

### P7 — Método muerto que direcciona por clave primaria sin comprobar dueño

`GastosApp.BusinessLogic/Services/Telegram/TelegramIdentityService.SetActiveAsync` no tiene ningún llamador en
producción ni en pruebas, y su firma no recibe `userId`, así que no puede comprobar propiedad. El despliegue
asume una única identidad (`Telegram:AppUserId`, validado en
`GastosApp.API/Extensions/TelegramConfigurationExtensions.cs:63`). Decidir: borrarlo o darle alcance.

---

## 5. Antes de desplegar

### P8 — Revisar `Cors__AllowedOrigins` en producción  ⚠️

T3 hizo que **Production no arranque** si `Cors:AllowedOrigins` falta. Además, un origen malformado — con barra
final, sin esquema, con ruta o con comodín — ahora falla en cualquier entorno. Antes de desplegar, confirmar que
la variable de entorno de producción tiene orígenes exactos y sin barra final.

El fallo es a propósito: es preferible a arrancar y rechazar en silencio al frontend real.

### P9 — `.env`

`Auth__Username` y `Auth__Password` quedaron comentados (nadie los leía, y el segundo era una credencial en texto
plano). `.env` está en `.gitignore`, así que ese cambio no está en ningún commit. Si se despliega desde un `.env`
propio, revisar que no arrastre valores muertos.

---

## 6. Ambiente y limpieza

### P10 — Proceso residual

Un `dotnet GastosApp.API.dll` (pid `2923678`) quedó vivo de una reproducción en Development y esta sesión no tiene
permiso para matarlo. Ya no escucha en su puerto, así que es inofensivo, pero conviene cerrarlo:

```bash
kill -9 2923678
```

### P11 — `docs/ntfy.env.example` modificado sin commitear

Ese archivo estaba modificado **antes** de que empezara este trabajo y se dejó exactamente como se encontró, fuera
de todos los commits. Decidir si esos cambios se commitean o se descartan.

---

## 7. Ramas borradas (recuperables)

Tras la fusión se borraron las ramas ya fusionadas en `main`. Ninguna contenía trabajo sin fusionar
(`git branch --merged main` y `git rev-list --count main..<rama>` = 0 en todas), y todos sus commits viven en la
historia de `main`, así que se recuperan con `git branch <nombre> <hash>`:

| Rama | Tip |
|---|---|
| `feat/backend-hardening` | `dc3b4d5` |
| `feat/backend-hardening-tests` | `d6250ff` |
| `feat/backend-hardening-resilience` | `1487ad7` |
| `feat/backend-hardening-queries` | `6460e42` |
| `feat/backend-hardening-scoping` | `63557e5` |
| `feat/accounts-cash-credit-tables` | `329e883` |
| `fix/dashboard-cutoff-cash-breakdown` | `4d427ac` |
| `work/server-credit-reconciliation-ux` | `302748e` |

No se tocó nada del remoto: `origin/LayoutFront` sigue intacta y **`main` no se ha empujado** (`origin/main` sigue
en `dc3b4d5`).
