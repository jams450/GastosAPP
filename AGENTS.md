# AGENTS.md

## Repo reality check (read this first)
- `code.sln` includes `GastosApp.API`, `GastosApp.BusinessLogic`, `GastosApp.Models` (backend).
- `GastosApp.Web/` is a populated Next.js frontend (App Router). It is **not** in `code.sln`; it is built by the `frontend` service in `docker-compose.yml`.
- Ignore any `gastos-frontend/` references in old docs; the real frontend is `GastosApp.Web/`.

## High-value entrypoints
- API bootstrap/composition root: `GastosApp.API/Program.cs`
- DI registration: `GastosApp.API/Extensions/ServiceCollectionExtensions.cs` (all services `AddScoped`)
- HTTP endpoints: `GastosApp.API/Controllers/*.cs`
- Domain/data services: `GastosApp.BusinessLogic/Services/*.cs`
- EF DbContext/model wiring: `GastosApp.BusinessLogic/Context/ContextSqlGastos.cs`
- Base EF timestamp/audit behavior: `GastosApp.Models/Context/ContextSql.cs`
- DB bootstrap schema for Docker Postgres: `SQL/schema.sql`

## Verified commands (use these, not guesses)
- Restore/build full solution:
  - `dotnet restore code.sln`
  - `dotnet build code.sln`
- Run API locally (launchSettings applies in Development):
  - `dotnet run --project GastosApp.API/GastosApp.API.csproj`
  - Dev URLs from launch settings: `http://localhost:5181` and `https://localhost:7052`
- Run via Docker compose stack:
  - `docker compose up -d`
  - API is published on `http://localhost:5000` (container port `8080`)
  - Postgres is on `localhost:5432`

## Validation workflow
- There are **no test projects** in this repo (`*Tests*.csproj` / test SDK not present).
- Minimum safe verification after changes:
  1. `dotnet build code.sln`
  2. Start API (`dotnet run --project ...` or Docker)
  3. Smoke auth: `POST /api/auth/login`

## Auth / user-scoping reality
- `JwtService.GenerateToken` emits the user id as **both** `sub` and `ClaimTypes.NameIdentifier`, plus `Name`, `sessionVersion`, `jti`, optional `sid`, optional `Role`.
- Every controller derives the user id from `ICurrentUserService` (reads JWT claims from `HttpContext`). There is **no fallback to `1`**; missing claims throw `UnauthorizedAccessException` → 401.
- `AuthenticationExtensions` validates the JWT **against the DB** in `OnTokenValidated`: user must be active/not locked, `sessionVersion` must match, and the `sid` must exist as a non-revoked, non-expired `UserSession` row. A hand-minted token with a fixed user id is rejected unless a matching session row exists.
- Controllers are gated by `[Authorize(Policy="UserWithId")]` (`"AdminWithId"` for `Users`). There is no API-key/bot/service-account auth path.
- OpenAPI is mapped only in Development (`app.MapOpenApi()` inside `if (app.Environment.IsDevelopment())`).

## Config/security gotchas for agents
- Secrets are present in tracked config files (`.env`, `GastosApp.API/appsettings.json`). Treat values as sensitive; do not copy them into PR text/issues/log summaries.
- Runtime config precedence matters: Docker sets connection string/JWT/CORS via environment variables; local `dotnet run` uses `appsettings.json` + launch profile environment.
- `Dockerfile.api` uses **.NET 9.0** images (`sdk:9.0`, `aspnet:9.0`), matching the projects' `net9.0`.

## Docs vs executable truth
- Some docs may describe a broader (frontend+tunnel) deployment. When docs conflict, trust current executable sources: `code.sln`, `.csproj`, `Program.cs`, `docker-compose.yml`, and files that actually exist.
