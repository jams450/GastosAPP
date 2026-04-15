# AGENTS.md

## Repo reality check (read this first)
- This repo is currently **backend-only in code**: `code.sln` includes `GastosApp.API`, `GastosApp.BusinessLogic`, `GastosApp.Models`.
- `gastos-frontend/` is referenced by docs and `docker-compose.yml` but is **not present** in this checkout.
- `GastosApp.Web/` exists but is empty and not part of the solution.

## High-value entrypoints
- API bootstrap/composition root: `GastosApp.API/Program.cs`
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

## Critical implementation quirks
- `AccountsController.GetCurrentUserId()` currently falls back to `1` if `userId` claim is missing.
- JWT generation (`JwtService`) adds `Name` (+ optional `Role`) but **does not add `userId` claim**.
- Consequence: account scoping can silently use user `1` unless JWT/user-id handling is fixed end-to-end.
- OpenAPI endpoint is only mapped in Development (`app.MapOpenApi()` inside `if (app.Environment.IsDevelopment())`).

## Config/security gotchas for agents
- Secrets are present in tracked config files (`.env`, `GastosApp.API/appsettings.json`). Treat values as sensitive; do not copy them into PR text/issues/log summaries.
- Runtime config precedence matters: Docker sets connection string/JWT/CORS via environment variables; local `dotnet run` uses `appsettings.json` + launch profile environment.
- `Dockerfile.api` uses .NET **10.0** images while projects target **net9.0**. Keep this mismatch in mind when debugging build/runtime differences.

## Docs vs executable truth
- `README_IMPLEMENTATION.md` and `IMPLEMENTATION_GUIDE.md` describe a broader (frontend+tunnel) deployment.
- When docs conflict, trust current executable sources: `code.sln`, `.csproj`, `Program.cs`, `docker-compose.yml`, and files that actually exist.
