# GastosApp API Documentation

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
