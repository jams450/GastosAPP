# GastosApp API Documentation

## Frontend Catálogos · Homologación visual de Subcategorías (estilo Cuentas)

> Se homologó únicamente la UI de `Subcategorías` en `GastosApp.Web` para alinearla con el estilo visual de `Cuentas`.

### Alcance implementado

- Ajuste de composición visual de `Subcategorías` para paridad con patrón de `Cuentas`.
- Tabla en modo compacto y ajuste de estructura de resultados.
- Ajustes en barra de filtros y botones de acción para mantener consistencia visual.
- Reemplazo del modal centrado por drawer lateral para alta/edición.

### Archivos tocados

- `GastosApp.Web/app/catalogs/subcategories/subcategories-section.tsx`

### Restricciones respetadas

- Sin cambios en lógica de negocio de catálogos.
- Sin cambios en BFF/API contracts.
- Sin cambios en auth.
- Sin cambios backend (`GastosApp.API`, `GastosApp.BusinessLogic`, `GastosApp.Models`).

### Validación manual mínima sugerida

1. Abrir `/catalogs/subcategories` y confirmar nueva estructura visual (tabla/filtros/botones) alineada a `Cuentas`.
2. Verificar alta/edición desde drawer lateral y confirmar que se mantienen validaciones existentes.
3. Ejecutar eliminación y refresh para confirmar que el comportamiento funcional permanece sin cambios.
4. Confirmar que no hay cambios en tráfico BFF ni contratos de endpoints usados por la pantalla.

### Rollback rápido (si se requiere)

- Revertir cambios en `GastosApp.Web/app/catalogs/subcategories/subcategories-section.tsx`.
- Validar que la pantalla vuelve al layout previo sin impacto funcional.

## Frontend Accounts · Fase D (migración a AdminShell + a11y focus trap)

> Se aplicó Fase D únicamente al módulo `Accounts` en `GastosApp.Web`, manteniendo alcance de UI/composición.

### Alcance implementado

- Migración de layout de `Accounts` a `AdminShell` para paridad con `Users`.
- Ajustes visuales/compositivos para homologar patrón de navegación y estructura con `Users`.
- Mejora de accesibilidad en drawer con **focus trap** para navegación por teclado (`Tab` / `Shift+Tab`).

### Restricciones respetadas

- Cambios acotados a UI/composición de `Accounts`.
- Sin cambios en BFF/API contracts.
- Sin cambios en auth.
- Sin cambios backend (`GastosApp.API`, `GastosApp.BusinessLogic`, `GastosApp.Models`).

### Validación

- `npm run lint` ✅
- `npm run build` ✅

### Validación manual mínima sugerida

1. Abrir `Accounts` y confirmar render dentro de `AdminShell` con patrón equivalente a `Users`.
2. Abrir drawer (alta/edición) y validar ciclo de foco:
   - `Tab` mantiene foco dentro del drawer,
   - `Shift+Tab` recorre elementos en sentido inverso sin escapar del drawer,
   - cierre y retorno de foco al trigger.
3. Confirmar que no hay cambios funcionales en flujos BFF/auth/backend.

### Rollback rápido (si se requiere)

- Revertir cambios de Fase D en `accounts-client.tsx` y `account-form-drawer.tsx`.
- Mantener Fases A/B/C sin alteración funcional.

## Frontend Accounts · Fase C (accesibilidad drawer + estados UX + privacidad mobile)

> Se aplicó Fase C únicamente al módulo `Accounts` en `GastosApp.Web`, manteniendo alcance de UI/composición.

### Alcance implementado

- Mejora de accesibilidad en drawer de cuenta:
  - atributos y semántica de modal (`role`/`aria`),
  - cierre por teclado con `Escape`,
  - manejo de foco para apertura/cierre y navegación básica.
- Homologación de estados UX entre desktop y mobile:
  - `loading`,
  - estado vacío,
  - estado de error,
  - render de resultados consistente.
- Ajuste de privacidad visual en mobile:
  - se oculta `accountId` en el listado móvil.

### Restricciones respetadas

- Cambios acotados a UI/composición de `Accounts`.
- Sin cambios en lógica de negocio de `Accounts`.
- Sin cambios en BFF/API contracts.
- Sin cambios en auth.
- Sin cambios backend (`GastosApp.API`, `GastosApp.BusinessLogic`, `GastosApp.Models`).

### Validación manual mínima sugerida

1. Abrir Accounts en desktop y mobile; confirmar estados `loading`, vacío, error y resultados.
2. Abrir drawer de creación/edición y validar:
   - foco inicial dentro del drawer,
   - cierre con `Escape`,
   - retorno de foco al trigger al cerrar.
3. Revisar lista mobile y confirmar que no se muestra `accountId`.

### Rollback rápido (si se requiere)

- Revertir cambios de Fase C en componentes de Accounts (drawer/resultados/lista mobile).
- Mantener Fases A/B sin alteración funcional.

## Frontend Accounts · Fase B (UI/composición: acciones, mobile list y helpers UI)

> Se aplicó Fase B únicamente al módulo `Accounts` en `GastosApp.Web`, extendiendo el patrón visual/compositivo ya iniciado en Fase A.

### Alcance implementado

- Incorporación de menú de acciones reutilizable para cuentas (`AccountActionsMenu`) con variantes desktop/mobile.
- Incorporación de listado mobile de cuentas (`AccountsMobileList`) para paridad funcional con la vista de tabla.
- Incorporación de helpers UI (`accounts-ui.ts`) para centralizar etiquetas/clases de badges (tipo y estado).
- Ajustes de composición en:
  - `accounts-table.tsx` (usa `AccountActionsMenu` y helpers UI),
  - `accounts-results.tsx` (orquesta mobile + desktop),
  - `accounts-client.tsx` (mantiene wiring de handlers/estado con nueva composición).

### Archivos tocados (Fase B)

- `GastosApp.Web/app/accounts/_components/account-actions-menu.tsx` (nuevo)
- `GastosApp.Web/app/accounts/_components/accounts-mobile-list.tsx` (nuevo)
- `GastosApp.Web/app/accounts/_lib/accounts-ui.ts` (nuevo)
- `GastosApp.Web/app/accounts/_components/accounts-table.tsx`
- `GastosApp.Web/app/accounts/_components/accounts-results.tsx`
- `GastosApp.Web/app/accounts/accounts-client.tsx`

### Restricciones respetadas

- Cambios acotados a UI/composición de `Accounts`.
- Sin cambios en lógica de negocio de `Accounts`.
- Sin cambios en BFF/API contracts.
- Sin cambios en auth.
- Sin cambios backend (`GastosApp.API`, `GastosApp.BusinessLogic`, `GastosApp.Models`).

### Validación

- Validación objetivo de la fase:
  - `npm run lint`
  - `npm run build`
- Resultado de ejecución: **pendiente adjuntar evidencia/salida en este documento**.

### Riesgos pendientes

- Posible drift visual residual con módulos que aún no migran completamente al mismo patrón.
- Riesgo de diferencias de comportamiento desktop/mobile ante futuros cambios si no se mantiene la paridad entre `AccountsTable` y `AccountsMobileList`.
- Deuda de consolidación adicional en componentes compartidos si se replica este patrón en más módulos.

## Frontend Accounts · Fase A (estructura patrón Users: header + toolbar + results)

> Se aplicó Fase A únicamente al módulo `Accounts` en `GastosApp.Web`, alineando estructura visual con patrón `Users`.

### Alcance implementado

- Reorganización del `AccountsClient` para patrón de composición: **header + toolbar + results**.
- Extracción/uso de componente de resultados para encapsular la tabla (`AccountsResults`).
- Ajuste visual/estructural del toolbar de cuentas para consistencia con patrón `Users`.

### Archivos tocados (Fase A)

- `GastosApp.Web/app/accounts/accounts-client.tsx`
- `GastosApp.Web/app/accounts/_components/accounts-toolbar.tsx`
- `GastosApp.Web/app/accounts/_components/accounts-results.tsx` (nuevo)

### Restricciones respetadas

- Sin cambios en lógica de negocio de `Accounts`.
- Sin cambios en BFF/API contracts.
- Sin cambios en auth.
- Sin cambios backend (`GastosApp.API`, `GastosApp.BusinessLogic`, `GastosApp.Models`).

### Validación

- `npm run lint`: **pendiente confirmar evidencia en esta fase**.
- `npm run build`: **pendiente confirmar evidencia en esta fase**.

### Riesgos pendientes

- Puede persistir drift visual entre `Accounts` y otros módulos hasta completar réplica por fases.
- Riesgo de divergencia desktop/mobile si el patrón de resultados no se centraliza en componentes compartidos.
- Queda deuda de homogeneización en módulos fuera de `Users`/`Accounts`.

## Frontend Users + navegación compartida · Fases 0-2 (ejecución acotada)

> Se ejecutaron Fase 0, 1 y 2 **solo** sobre módulo `Users` y piezas compartidas de navegación en `GastosApp.Web`.

### Alcance implementado

- Estandarización inicial (Fase 0) y refactor incremental en `Users` (Fase 1-2).
- Eliminación de duplicación de configuración/lógica de navegación (`navItems` e `isRouteActive`) mediante extracción a archivo compartido.
- Simplificación de lógica de badges/mensajería visual en componentes de `Users`.

### Archivos nuevos

- `GastosApp.Web/app/_components/layout/nav-config.ts`
- `GastosApp.Web/app/users/_components/users-ui.ts`

### Archivos modificados

- `GastosApp.Web/app/_components/layout/app-menu.tsx`
- `GastosApp.Web/app/_components/layout/admin-shell.tsx`
- `GastosApp.Web/app/users/_components/users-table.tsx`
- `GastosApp.Web/app/users/_components/users-mobile-list.tsx`
- `GastosApp.Web/app/users/users-client.tsx`

### Restricciones respetadas

- Sin cambios en contratos/API de BFF.
- Sin cambios en auth.
- Sin cambios backend (`GastosApp.API`, `GastosApp.BusinessLogic`, `GastosApp.Models`).

### Validación ejecutada

- `npm run lint` ✅
- `npm run build` ✅

### Riesgos pendientes

- Replicación a otros módulos (Catalogs, Accounts, Transactions, Dashboard) puede introducir drift si no se aplica el mismo patrón compartido.
- Posibles diferencias visuales/comportamiento entre desktop y mobile en futuras extensiones si no se centraliza más UI común.
- Al mantenerse alcance acotado a `Users`, aún existe deuda de homogeneización global de navegación/UI.

## Frontend Catalogs · Fase 2 (desacople por pantallas individuales)

> Se desacopló la vista unificada de `Catalogs` en pantallas individuales por entidad, manteniendo los mismos contratos BFF y secciones existentes.

### Rutas individuales incorporadas

- `/catalogs/categories`
- `/catalogs/subcategories`
- `/catalogs/merchants`
- `/catalogs/tags`
- `/catalogs/billable-parties`

Cada `page.tsx` valida sesión con `getServerSession()` y redirige a `/login` cuando no hay sesión.

### Estructura aplicada

- Cliente compartido para pantalla individual:
  - `GastosApp.Web/app/catalogs/_shared/catalog-single-screen-client.tsx`
- Clientes por pantalla:
  - `GastosApp.Web/app/catalogs/categories/categories-client.tsx`
  - `GastosApp.Web/app/catalogs/subcategories/subcategories-client.tsx`
  - `GastosApp.Web/app/catalogs/merchants/merchants-client.tsx`
  - `GastosApp.Web/app/catalogs/tags/tags-client.tsx`
  - `GastosApp.Web/app/catalogs/billable-parties/billable-parties-client.tsx`
- API client compartido (lectura/listado):
  - `GastosApp.Web/app/catalogs/_shared/catalogs-api.ts`

### Endpoints BFF consumidos por pantalla

- Categorías (`/catalogs/categories`):
  - `GET /api/bff/catalogs/categories`
- Subcategorías (`/catalogs/subcategories`):
  - `GET /api/bff/catalogs/subcategories`
  - `GET /api/bff/catalogs/categories` (para resolver catálogo padre en formularios/tabla)
- Comercios (`/catalogs/merchants`):
  - `GET /api/bff/catalogs/merchants`
- Tags (`/catalogs/tags`):
  - `GET /api/bff/catalogs/tags`
- Responsables cobrables (`/catalogs/billable-parties`):
  - `GET /api/bff/catalogs/billable-parties`

> La ruta unificada `GET /api/bff/catalogs/bootstrap` fue retirada en cleanup final de Catálogos.

### Estado/handlers compartidos que se reducen en Fase 2

En el cliente unificado (`catalogs-client.tsx`) se compartían entre secciones:
- `catalogs` (payload agregado),
- `globalSuccess`,
- `error` global,
- `expandedSection` + `toggleSection`,
- `loadCatalogs()` único basado en `GET /api/bff/catalogs/bootstrap`.

Con Fase 2, cada pantalla individual aísla su propio:
- `loading`,
- `error`,
- `success` temporal,
- `refresh` (`onDataChanged`) con fetch específico por entidad.

### Validación manual mínima

1. Entrar autenticado a cada ruta individual de catálogos.
2. Confirmar carga inicial y contador por entidad en header (`meta`).
3. Ejecutar alta/edición/baja desde cada sección y verificar refresh de datos en la misma pantalla.
4. En `/catalogs/subcategories`, validar que se cargan subcategorías y categorías relacionadas.
5. Verificar que `/catalogs` redirige a `/catalogs/categories` sin romper navegación.

### Riesgos pendientes

- Ya no hay duplicidad de mantenimiento: la vista unificada legacy fue eliminada y se mantienen rutas individuales por entidad.
- Posible drift de UX/mensajería entre pantallas si los cambios futuros no se aplican de forma homogénea en todas las secciones.
- `subcategories-client` depende de dos requests en paralelo; fallas parciales impactan la pantalla completa.

### Rollback rápido (si se requiere)

- Reintroducir cliente unificado y endpoint bootstrap solo si se decide volver al modelo agregado.

## Frontend Catalogs · Fase 3 (redirect de `/catalogs` a `/catalogs/categories`)

> Se retiró `/catalogs` del flujo principal: la ruta deja de mostrar la vista legacy y pasa a redirigir a la pantalla de categorías.
>
> **Estado final vigente:** no hay vista unificada legacy activa en runtime; el acceso operativo de Catálogos es por pantallas individuales.

### Cambio implementado

- `GastosApp.Web/app/catalogs/page.tsx`:
  - mantiene validación de sesión,
  - redirige a usuarios autenticados a `/catalogs/categories`,
  - redirige a usuarios no autenticados a `/login`.

### Estado de código legacy

- `GastosApp.Web/app/catalogs/catalogs-client.tsx` fue eliminado.
- `GastosApp.Web/app/catalogs/_shared/catalogs-types.ts` fue eliminado.
- `GastosApp.Web/app/api/bff/catalogs/bootstrap/route.ts` fue eliminado.

### Flujo final de navegación (Catálogos)

1. Usuario sin sesión intenta abrir `/catalogs` → redirección a `/login`.
2. Usuario autenticado abre `/catalogs` → redirección automática a `/catalogs/categories`.
3. Navegación principal de Catálogos continúa por rutas individuales (`/catalogs/categories`, `/catalogs/subcategories`, `/catalogs/merchants`, `/catalogs/tags`, `/catalogs/billable-parties`).

### Pantallas vigentes (flujo final)

- `/catalogs/categories`
- `/catalogs/subcategories`
- `/catalogs/merchants`
- `/catalogs/tags`
- `/catalogs/billable-parties`

### Validación manual mínima

1. Abrir `/catalogs` sin sesión y confirmar redirect a `/login`.
2. Abrir `/catalogs` con sesión activa y confirmar redirect a `/catalogs/categories`.
3. Confirmar que las rutas individuales siguen accesibles desde navegación (`admin-shell` / `app-menu`).

### Rollback rápido (si se requiere)

- Reintroducir la vista unificada en `GastosApp.Web/app/catalogs/page.tsx`.
- Restaurar `catalogs-client.tsx`, `catalogs-types.ts` y `GET /api/bff/catalogs/bootstrap`.

## Estado actual del frontend (Hard replace UI Users con base Tabler)

### Actualización específica: módulo Users

> Se ejecutó hard replace visual del módulo `Users` sobre layout base tipo Tabler, **sin cambios en lógica de negocio ni contratos API/BFF**.

#### Alcance implementado

- Reemplazo de composición visual en `Users` (toolbar, tabla/lista desktop+mobile, menús de acción, drawer de formulario, confirmación de borrado, toasts).
- Integración de layout/base visual compartida para panel admin (shell + navegación + estilos globales/componentes UI).
- Mantenimiento explícito de hooks, handlers, tipos y llamadas existentes (solo cambio de capa UI).

#### Archivos clave modificados

- Base layout y navegación:
  - `GastosApp.Web/components/navigation/admin-shell.tsx`
  - `GastosApp.Web/components/navigation/app-menu.tsx`
- Base visual/UI:
  - `GastosApp.Web/app/globals.css`
  - `GastosApp.Web/components/ui/alert.tsx`
  - `GastosApp.Web/components/ui/button.tsx`
  - `GastosApp.Web/components/ui/card.tsx`
  - `GastosApp.Web/components/ui/input.tsx`
- Módulo `Users`:
  - `GastosApp.Web/app/users/users-client.tsx`
  - `GastosApp.Web/app/users/_components/users-toolbar.tsx`
  - `GastosApp.Web/app/users/_components/users-results.tsx`
  - `GastosApp.Web/app/users/_components/users-table.tsx`
  - `GastosApp.Web/app/users/_components/users-mobile-list.tsx`
  - `GastosApp.Web/app/users/_components/user-actions-menu.tsx`
  - `GastosApp.Web/app/users/_components/user-form-drawer.tsx`
  - `GastosApp.Web/app/users/_components/user-delete-confirm-dialog.tsx`
  - `GastosApp.Web/app/users/_components/users-toast-stack.tsx`

#### Validación ejecutada

Desde `GastosApp.Web/`:

1. `npm run lint`
2. `npm run build`

Resultado esperado/documentado para este cambio:
- Lint y build en verde para habilitar handoff a siguiente módulo.

#### Pendientes mínimos antes de pasar a `Catalogs`

1. Smoke manual de `Users` con datos reales:
   - listar, buscar, crear, editar, eliminar,
   - revisar estados `loading / empty / error`.
2. Verificar responsive (`users-table` vs `users-mobile-list`) y consistencia de acciones.
3. Confirmar accesibilidad básica (focus visible, navegación teclado en toolbar/menús/dialog).
4. Cerrar ajuste visual menor pendiente en `Users` (si aparece en QA) antes de replicar patrón en `Catalogs`.

## Estructura modular de arranque (Program.cs + Extensions)

El arranque de la API se organiza en `Program.cs` como orquestador, delegando configuración por responsabilidad en `GastosApp.API/Extensions`.

### Program.cs
- Crea el `WebApplicationBuilder`.
- Encadena el registro de servicios vía extensiones:
  - `AddApiMvc()`
  - `AddApiOpenApi()`
  - `AddApiHttpContext()`
  - `AddApiCors(configuration)`
  - `AddApiDatabase(configuration)`
  - `AddApiAuthentication(configuration)`
  - `AddApiAuthorization()`
  - `AddApiApplicationServices()`
- Construye la app y configura pipeline:
  - `UseApiOpenApiIfDevelopment()`
  - `UseCors("Production")`
  - `UseAuthentication()`
  - `UseAuthorization()`
  - `MapControllers()`

### Responsabilidades por archivo (`GastosApp.API/Extensions`)
- `MvcExtensions.cs`
  - Registro de controladores y opciones JSON (`IgnoreCycles`, ignorar nulls).
  - Registro de OpenAPI (`AddOpenApi`).
  - Registro de `HttpContextAccessor`.

- `CorsExtensions.cs`
  - Lee `Cors:AllowedOrigins` (array o CSV fallback).
  - Define política CORS `Production` con `AllowAnyHeader`, `AllowAnyMethod`, `AllowCredentials`.
  - Falla explícitamente si no hay orígenes configurados.

- `DatabaseExtensions.cs`
  - Resuelve `ConnectionStrings:DefaultConnection`.
  - Configura `ContextSqlGastos` con `UseNpgsql`.

- `AuthenticationExtensions.cs`
  - Configura `JwtBearer` y validación de token.
  - Requiere `Jwt:Key` y valida issuer/audience/lifetime/signature.

- `AuthorizationExtensions.cs`
  - Define políticas `UserWithId` y `AdminWithId`.
  - Valida claim de usuario (`NameIdentifier` o `sub`) con parseo entero.

- `ServiceCollectionExtensions.cs`
  - Registra servicios de aplicación y negocio en DI (scoped), incluyendo auth, usuarios, cuentas, transacciones, dashboard y repositorio.

- `EndpointExtensions.cs`
  - Expone OpenAPI solo en entorno `Development` (`MapOpenApi`).

> Nota operativa: esta modularización conserva la secuencia de arranque en un punto único (`Program.cs`) y reduce acoplamiento de configuración.

## Base URL

```
Local Development: http://localhost:5000
Docker Network: http://api:8080 (desde contenedores)
```

## Autenticación

La API utiliza **JWT Bearer Token** para autenticación.

### Notas técnicas del refactor de servicios auth (mayo 2026)

- **Claims centralizados:** se creó `GastosApp.API/Security/ClaimNames.cs` para unificar nombres de claims JWT (`sub`, `NameIdentifier`, `Name`, `sessionVersion`, `sid`, `role`).
- **`JwtService` actualizado:** ahora emite de forma consistente claims de identidad y sesión:
  - `sub` + `NameIdentifier` con `userId`
  - `Name` con `username`
  - `sessionVersion`
  - `sid` cuando existe sesión de refresh
  - `role=Admin` solo para usuarios admin
- **`CurrentUserService` ampliado:** el contrato `ICurrentUserService` agrega:
  - `GetRequiredUserId()`
  - `GetSessionVersion()`
  - `GetSessionId()`
  - Mantiene `GetUserId()`, `GetName()`, `GetEmail()`, `IsAdmin()`
- **Rotación de refresh token atómica:** `AuthService.RefreshAsync()` revoca la sesión actual, crea nueva sesión y enlaza `ReplacedBySessionId` dentro de transacción (`RotateRefreshTokenAtomicAsync`).
- **Contratos API preservados:** se mantienen rutas y forma de respuesta en `POST /api/auth/login`, `POST /api/auth/refresh` y `POST /api/auth/logout`.

#### Validación manual mínima

1. `POST /api/auth/login` devuelve `token` (y `refreshToken` para usuario no admin).
2. `POST /api/auth/refresh` con token válido devuelve nuevo `token` + nuevo `refreshToken`.
3. Reutilizar el refresh token anterior debe responder `401 Invalid refresh token`.
4. `POST /api/auth/logout` invalida el refresh token enviado.

#### Rollback (si se requiere)

- Revertir cambios en:
  - `GastosApp.API/Services/AuthService.cs`
  - `GastosApp.API/Services/JwtService.cs`
  - `GastosApp.API/Services/CurrentUserService.cs`
  - `GastosApp.BusinessLogic/Interfaces/ICurrentUserService.cs`
  - `GastosApp.API/Security/ClaimNames.cs`
- Luego recompilar (`dotnet build code.sln`) y revalidar login/refresh/logout.

### Header Requerido
```
Authorization: Bearer {token}
```

### Obtener Token
Realizar login vía `POST /api/auth/login` para obtener el token JWT.

---

## Endpoints

### 1. Autenticación

#### POST /api/auth/login
Inicia sesión y obtiene token JWT.

**Autorización:** No requiere

**Request Body:**
```json
{
  "username": "usuario@ejemplo.com",
  "password": "contraseña123"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiration": "2025-02-14T18:30:00Z",
  "username": "usuario@ejemplo.com"
}
```

**Response (401 Unauthorized):**
```json
{
  "message": "Invalid credentials"
}
```

**Response (500 Internal Server Error):**
```json
{
  "message": "An error occurred"
}
```

---

### 2. Accounts (Cuentas)

**Base URL:** `/api/accounts`

**Autorización:** Requiere JWT

#### GET /api/accounts
Obtiene todas las cuentas del usuario autenticado.

**Response (200 OK):**
```json
[
  {
    "accountId": 1,
    "userId": 1,
    "name": "Cuenta Bancaria",
    "color": "#3B82F6",
    "active": true,
    "startDate": "2025-01-01T00:00:00Z",
    "isCredit": false,
    "dueDay": null,
    "currentBalance": 1500.00,
    "earnsInterest": false,
    "annualInterestRate": 0.00,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-02-14T10:30:00Z"
  }
]
```

#### GET /api/accounts/active
Obtiene solo las cuentas activas del usuario.

**Response (200 OK):** Mismo formato que arriba, filtrado por `active: true`

#### GET /api/accounts/{id}
Obtiene una cuenta específica.

**Path Parameters:**
- `id` (int): ID de la cuenta

**Response (200 OK):**
```json
{
  "accountId": 1,
  "userId": 1,
  "name": "Tarjeta de Crédito",
  "color": "#EF4444",
  "active": true,
  "startDate": "2025-01-01T00:00:00Z",
  "isCredit": true,
  "dueDay": 15,
  "currentBalance": 2500.00,
  "earnsInterest": false,
  "annualInterestRate": 0.00,
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-02-14T10:30:00Z"
}
```

**Response (404 Not Found):**
```json
{
  "message": "Account with ID 999 not found"
}
```

#### POST /api/accounts
Crea una nueva cuenta.

**Request Body:**
```json
{
  "name": "Nueva Cuenta",
  "color": "#10B981",
  "startDate": "2025-02-14T00:00:00Z",
  "isCredit": true,
  "dueDay": 20,
  "earnsInterest": false,
  "annualInterestRate": 0.00,
  "currentBalance": 0
}
```

**Validaciones:**
- `name`: Requerido, máximo 100 caracteres
- `color`: Opcional, máximo 7 caracteres (formato hex)
- `startDate`: Requerido, debe ser UTC
- `isCredit`: Si es true, `dueDay` es obligatorio
- `dueDay`: Obligatorio si `isCredit` es true
- `annualInterestRate`: Si `earnsInterest` es true, debe ser > 0

**Response (201 Created):**
```json
{
  "accountId": 2,
  "userId": 1,
  "name": "Nueva Cuenta",
  "color": "#10B981",
  "active": true,
  "startDate": "2025-02-14T00:00:00Z",
  "isCredit": true,
  "dueDay": 20,
  "currentBalance": 0.00,
  "earnsInterest": false,
  "annualInterestRate": 0.00,
  "createdAt": "2025-02-14T12:00:00Z",
  "updatedAt": "2025-02-14T12:00:00Z"
}
```

#### PUT /api/accounts/{id}
Actualiza una cuenta existente.

**Path Parameters:**
- `id` (int): ID de la cuenta

**Request Body:**
```json
{
  "name": "Cuenta Actualizada",
  "color": "#F59E0B",
  "active": true,
  "startDate": "2025-02-14T00:00:00Z",
  "isCredit": true,
  "dueDay": 25,
  "earnsInterest": false,
  "currentBalance": 1000.00,
  "annualInterestRate": 0.00
}
```

**Notas:**
- Todos los campos son opcionales
- Solo se actualizan los campos proporcionados
- `startDate` debe ser UTC

**Response (200 OK):** Mismo formato que GET /api/accounts/{id}

#### PATCH /api/accounts/{id}/active
Activa o desactiva una cuenta.

**Path Parameters:**
- `id` (int): ID de la cuenta

**Request Body:**
```json
false
```

**Response (200 OK):**
```json
{
  "message": "Account active status updated to False"
}
```

#### DELETE /api/accounts/{id}
Elimina una cuenta.

**Response (200 OK):**
```json
{
  "message": "Account deleted successfully"
}
```

#### POST /api/accounts/{id}/recalculate-balance
Recalcula el saldo de la cuenta basado en transacciones.

**Response (200 OK):**
```json
{
  "message": "Balance recalculated successfully"
}
```

#### GET /api/accounts/{id}/credit-expenses
Obtiene los gastos del período para tarjetas de crédito.

**Path Parameters:**
- `id` (int): ID de la cuenta

**Query Parameters:**
- `referenceDate` (DateTime, optional): Fecha de referencia. Default: fecha actual

**Response (200 OK):**
```json
{
  "accountId": 1,
  "accountName": "Tarjeta Visa",
  "dueDay": 15,
  "referenceDate": "2025-02-14T00:00:00Z",
  "periodStart": "2025-01-16T00:00:00Z",
  "periodEnd": "2025-02-15T00:00:00Z",
  "totalExpenses": 1250.50,
  "message": "Expenses from 2025-01-16 to 2025-02-15"
}
```

**Notas:**
- Solo funciona para cuentas con `isCredit: true`
- El período se calcula automáticamente basado en `dueDay`

---

### 3. Transactions (Transacciones)

**Base URL:** `/api/transactions`

**Autorización:** Requiere JWT

#### GET /api/transactions/account/{accountId}
Obtiene todas las transacciones de una cuenta.

**Path Parameters:**
- `accountId` (int): ID de la cuenta

**Response (200 OK):**
```json
[
  {
    "transactionId": 1,
    "accountId": 1,
    "categoryId": 2,
    "type": "expense",
    "transferGroupId": null,
    "amount": 50.00,
    "description": "Compra supermercado",
    "transactionDate": "2025-02-14T15:30:00Z",
    "createdAt": "2025-02-14T15:30:00Z",
    "updatedAt": "2025-02-14T15:30:00Z",
    "createdBy": "usuario@ejemplo.com",
    "updatedBy": null
  }
]
```

#### GET /api/transactions/account/{accountId}/date-range
Obtiene transacciones en un rango de fechas.

**Path Parameters:**
- `accountId` (int): ID de la cuenta

**Query Parameters:**
- `startDate` (DateTime, required): Fecha inicio (ISO 8601)
- `endDate` (DateTime, required): Fecha fin (ISO 8601)

**Example:**
```
GET /api/transactions/account/1/date-range?startDate=2025-01-01&endDate=2025-02-14
```

#### GET /api/transactions/category/{categoryId}
Obtiene transacciones por categoría.

**Path Parameters:**
- `categoryId` (int): ID de la categoría

#### GET /api/transactions/{id}
Obtiene una transacción específica.

**Path Parameters:**
- `id` (int): ID de la transacción

#### POST /api/transactions/income
Crea un ingreso (suma al saldo de la cuenta).

**Request Body:**
```json
{
  "accountId": 1,
  "categoryId": 1,
  "amount": 1500.00,
  "description": "Salario mensual",
  "transactionDate": "2025-02-14T10:00:00Z"
}
```

**Validaciones:**
- `accountId`: Requerido
- `amount`: Requerido, mínimo 0.01
- `transactionDate`: Requerido, debe ser UTC

**Response (201 Created):** Objeto Transaction completo

#### POST /api/transactions/expense
Crea un gasto (resta del saldo de la cuenta).

**Request Body:**
```json
{
  "accountId": 1,
  "categoryId": 2,
  "amount": 50.00,
  "description": "Compra supermercado",
  "transactionDate": "2025-02-14T15:30:00Z"
}
```

**Validaciones:**
- Verifica saldo suficiente antes de crear
- Si el saldo es insuficiente, retorna 400 Bad Request

**Response (201 Created):** Objeto Transaction completo

**Response (400 Bad Request):**
```json
{
  "message": "Insufficient balance"
}
```

#### POST /api/transactions/transfer
Crea una transferencia entre cuentas.

**Request Body:**
```json
{
  "sourceAccountId": 1,
  "destinationAccountId": 2,
  "amount": 500.00,
  "description": "Transferencia ahorro",
  "transactionDate": "2025-02-14T16:00:00Z",
  "categoryId": null
}
```

**Validaciones:**
- `sourceAccountId` y `destinationAccountId` deben ser diferentes
- Cuenta origen debe tener saldo suficiente
- Ambas cuentas deben existir

**Response (200 OK):**
```json
{
  "message": "Transfer created successfully"
}
```

**Response (400 Bad Request):**
```json
{
  "message": "Insufficient balance in source account"
}
```

#### POST /api/transactions/import/bancoppel/preview
Genera una vista previa de movimientos desde un PDF de estado de cuenta BanCoppel.

**Content-Type:** `multipart/form-data`

**Request Form Data:**
- `file` (IFormFile, requerido): archivo `.pdf`.

**Reglas clave:**
- Solo acepta archivos PDF (`.pdf`).
- Tamaño máximo de request: ~10 MB.
- Solo parsea la sección: `CARGOS, ABONOS Y COMPRAS REGULARES (NO A MESES)`.
- Normalización de signo:
  - monto positivo (`+`) => `type: "expense"`
  - monto negativo (`-`) => `type: "income"`

**Response (200 OK):**
```json
{
  "rows": [
    {
      "rowNumber": 1,
      "transactionDate": "2026-05-10T00:00:00Z",
      "amount": 350.00,
      "type": "expense",
      "description": "COMPRA COMERCIO"
    }
  ],
  "warnings": [],
  "errors": []
}
```

**Response (400 Bad Request):**
```json
{
  "message": "Archivo PDF requerido."
}
```

```json
{
  "message": "El archivo debe ser PDF."
}
```

#### POST /api/transactions/import/bancoppel/commit
Confirma e inserta en lote filas previamente revisadas.

**Request Body:**
```json
{
  "accountId": 1,
  "rows": [
    {
      "transactionDate": "2026-05-10T00:00:00Z",
      "amount": 350.00,
      "type": "expense",
      "description": "COMPRA COMERCIO",
      "categoryId": 2,
      "subcategoryId": 8,
      "merchantId": 15,
      "tags": ["banCoppel", "import"]
    }
  ]
}
```

**Contrato de filas (`rows[]`):**
- `transactionDate` (DateTimeOffset, requerido)
- `amount` (decimal > 0, requerido)
- `type` (string, requerido): `expense` o `income`
- `description` (string, requerido)
- `categoryId`, `subcategoryId`, `merchantId` (opcionales)
- `tags` (string[], opcional)

**Comportamiento clave:**
- Requiere cuenta existente y perteneciente al usuario autenticado.
- Deduplicación en el mismo lote (`date + description + amount + type + account`).
- Detección de posibles duplicados existentes en ventana +/- 7 días (se omiten con warning).
- Valida dimensiones analíticas (`category/subcategory/merchant`) antes de crear.

**Response (200 OK):**
```json
{
  "createdCount": 1,
  "skippedCount": 0,
  "warnings": [],
  "errors": []
}
```

**Response (400 Bad Request):**
Retorna el mismo contrato con `errors` cuando hay errores de negocio.
```json
{
  "createdCount": 0,
  "skippedCount": 0,
  "warnings": [],
  "errors": [
    "No se recibieron filas para importar."
  ]
}
```

#### PUT /api/transactions/{id}
Actualiza una transacción.

**Path Parameters:**
- `id` (int): ID de la transacción

**Request Body:**
```json
{
  "categoryId": 3,
  "amount": 75.00,
  "description": "Descripción actualizada",
  "transactionDate": "2025-02-14T12:00:00Z"
}
```

**Notas:**
- Todos los campos son opcionales
- Si se actualiza el monto, el saldo de la cuenta se recalcula automáticamente
- `transactionDate` debe ser UTC

#### DELETE /api/transactions/{id}
Elimina una transacción.

**Notas:**
- El saldo de la cuenta se actualiza automáticamente (revirtiendo el efecto)

**Response (200 OK):**
```json
{
  "message": "Transaction deleted successfully"
}
```

#### DELETE /api/transactions/transfer/{transferGroupId}
Elimina una transferencia completa (ambas transacciones).

**Path Parameters:**
- `transferGroupId` (Guid): GUID del grupo de transferencia

**Notas:**
- Revierte los saldos de ambas cuentas
- Elimina ambas transacciones asociadas al GUID

#### POST /api/transactions/account/{accountId}/recalculate-balance
Recalcula el saldo de una cuenta basado en todas sus transacciones.

**Path Parameters:**
- `accountId` (int): ID de la cuenta

**Response (200 OK):**
```json
{
  "balance": 2450.75
}
```

---

### 4. Users (Usuarios)

**Base URL:** `/api/users`

**Autorización:** Requiere JWT + Rol Admin (`AdminOnly` policy)

#### GET /api/users
Obtiene todos los usuarios.

**Response (200 OK):**
```json
[
  {
    "userId": 1,
    "name": "Usuario Ejemplo",
    "email": "usuario@ejemplo.com",
    "active": true,
    "admin": true,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-02-14T10:30:00Z",
    "createdBy": null,
    "updatedBy": null
  }
]
```

#### GET /api/users/{id}
Obtiene un usuario específico.

#### POST /api/users
Crea un nuevo usuario.

**Request Body:**
```json
{
  "name": "Nuevo Usuario",
  "email": "nuevo@ejemplo.com",
  "password": "contraseña123",
  "active": true,
  "admin": false
}
```

**Validaciones:**
- `email`: Debe ser único
- `password`: Requerido

**Response (201 Created):** Objeto User completo

**Response (409 Conflict):**
```json
{
  "message": "A user with this email already exists"
}
```

#### PUT /api/users/{id}
Actualiza un usuario.

#### PATCH /api/users/{id}/active
Activa/desactiva un usuario.

#### DELETE /api/users/{id}
Elimina un usuario.

---

## Códigos de Estado HTTP

| Código | Significado | Uso |
|--------|-------------|-----|
| 200 | OK | GET exitoso, operación completada |
| 201 | Created | POST exitoso, recurso creado |
| 400 | Bad Request | Datos inválidos, validaciones fallidas |
| 401 | Unauthorized | Token JWT faltante o inválido |
| 403 | Forbidden | Sin permisos (no admin) |
| 404 | Not Found | Recurso no existe |
| 409 | Conflict | Conflicto (email duplicado) |
| 500 | Internal Server Error | Error del servidor |

---

## DTOs de Referencia

### AccountCreateRequest
```typescript
interface AccountCreateRequest {
  name: string;           // required, max 100
  color?: string;         // max 7, default "#000000"
  startDate: string;      // ISO 8601 UTC
  isCredit?: boolean;     // default false
  dueDay?: number;        // required if isCredit
  earnsInterest?: boolean;// default false
  currentBalance?: number;// default 0
  annualInterestRate?: number; // 0-999.99, required if earnsInterest
}
```

### AccountUpdateRequest
```typescript
interface AccountUpdateRequest {
  name?: string;
  color?: string;
  active?: boolean;
  startDate?: string;     // ISO 8601 UTC
  isCredit?: boolean;
  dueDay?: number;
  earnsInterest?: boolean;
  currentBalance?: number;
  annualInterestRate?: number; // 0-999.99
}
```

### AccountResponse
```typescript
interface AccountResponse {
  accountId: number;
  userId: number;
  name: string;
  color: string;
  active: boolean;
  startDate: string;
  isCredit: boolean;
  dueDay?: number;
  currentBalance: number;
  earnsInterest: boolean;
  annualInterestRate: number;
  createdAt: string;
  updatedAt: string;
}
```

### CreateTransactionRequest
```typescript
interface CreateTransactionRequest {
  accountId: number;      // required
  categoryId?: number;
  amount: number;         // required, min 0.01
  description?: string;
  transactionDate: string;// ISO 8601 UTC
}
```

### CreateTransferRequest
```typescript
interface CreateTransferRequest {
  sourceAccountId: number;      // required
  destinationAccountId: number; // required
  amount: number;               // required, min 0.01
  description?: string;
  transactionDate?: string;     // ISO 8601 UTC
  categoryId?: number;
}
```

### UpdateTransactionRequest
```typescript
interface UpdateTransactionRequest {
  categoryId?: number;
  amount?: number;        // min 0.01
  description?: string;
  transactionDate?: string; // ISO 8601 UTC
}
```

### LoginRequest
```typescript
interface LoginRequest {
  username: string;  // email
  password: string;
}
```

### LoginResponse
```typescript
interface LoginResponse {
  token: string;
  expiration: string;  // ISO 8601
  username: string;
}
```

---

## Notas Importantes para Frontend

### 1. Fechas UTC
Todas las fechas deben enviarse en formato UTC (ISO 8601 con Z):
```javascript
// Correcto
"2025-02-14T10:30:00Z"

// Incorrecto (sin Z o con offset)
"2025-02-14T10:30:00"
"2025-02-14T10:30:00-06:00"
```

### 2. Manejo de Errores
La API siempre retorna un objeto JSON con `message` en caso de error:
```javascript
try {
  const response = await fetch('/api/accounts', { ... });
  if (!response.ok) {
    const error = await response.json();
    console.error(error.message);  // "Account with ID 999 not found"
  }
} catch (error) {
  // Error de red
}
```

### 3. Validaciones de Negocio
- **Cuentas de crédito:** Si `isCredit` es true, `dueDay` es obligatorio
- **Cuentas con interés:** Si `earnsInterest` es true, `annualInterestRate` debe ser > 0
- **Saldo insuficiente:** Al crear gastos o transferencias, validar saldo primero
- **Transferencias:** Cuentas origen y destino deben ser diferentes

### 4. Actualización de Saldos
Los saldos se actualizan automáticamente al:
- Crear ingresos/gastos/transferencias
- Eliminar transacciones
- El endpoint `recalculate-balance` permite forzar recálculo

---

## Ejemplos con cURL

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "user@example.com", "password": "password123"}'
```

### Crear Cuenta
```bash
curl -X POST http://localhost:5000/api/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbG..." \
  -d '{
    "name": "Cuenta de Ahorros",
    "startDate": "2025-02-14T00:00:00Z",
    "isCredit": false,
    "color": "#10B981"
  }'
```

### Crear Gasto
```bash
curl -X POST http://localhost:5000/api/transactions/expense \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbG..." \
  -d '{
    "accountId": 1,
    "amount": 50.00,
    "description": "Supermercado",
    "transactionDate": "2025-02-14T15:30:00Z",
    "categoryId": 2
  }'
```

### Obtener Gastos de Tarjeta de Crédito
```bash
curl "http://localhost:5000/api/accounts/1/credit-expenses?referenceDate=2025-02-14" \
  -H "Authorization: Bearer eyJhbG..."
```

---

## Configuración CORS (Requerida)

Agregar en tu API .NET (`Program.cs`):

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("NextJsFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// En el pipeline, antes de UseAuthorization:
app.UseCors("NextJsFrontend");
```

---

## Variables de Entorno Frontend

```env
# .env.local
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=tu-clave-secreta-minimo-32-caracteres
API_URL=http://localhost:5000
```

---

*Documentación generada para Next.js Frontend Integration*
*Última actualización: Febrero 2025*


124lc6KHSM6Q/J1Wik7FdJJ7DkN3325l963QRFYHeTE=
