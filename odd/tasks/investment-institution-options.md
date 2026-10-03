# Investment institution options

## Route and scope

Delegated implementation: this bounded work unit crosses frontend, domain validation and SQL writes. Native review remains parent-owned; no native START or self-consent.

- Branch: `feat/investment-institution-options` (created from clean `main`).
- Authorized surfaces: frontend institution contract, domain institution catalog, investment form model and its existing test, `SQL/schema.sql`, `SQL/migrations/2026-10-03_investment_institution_codes.sql`, `docs/INVERSION_RENTA_FIJA_V1.md`, and this task.
- Forbidden: live migration execution, server changes, remote operations, secrets, dependency installs, push and PR.

## Task

- [x] Append Openbank (`openbank`), Mifel (`mifel`) and Otra (`otra`) after existing institution codes without changing their labels or order; align all allowlists, add a transactional repeatable CHECK migration, update documentation, demonstrate RED/GREEN and commit the coherent unit.

## Checks and forecast

Expected diff: under the advisory 400-line budget, one coherent feature commit. Preserve Spanish UI labels and existing English technical documentation. Existing Next.js 15.5.14 App Router/React 19 conventions remain unchanged.

Evidence path:
1. Extend deterministic form tests for all ten codes, exact catalog labels/order/parity, and valid form/payload for each new code; run the targeted Node test expecting RED before implementation and GREEN after.
2. Run `npm test` and `npm run typecheck` with existing dependencies only.
3. Run `dotnet build code.sln --no-restore` if restore assets exist; report blockers without restoring.
4. Statically compare ordered domain/form/frontend/schema/migration codes; run `git diff --check`. No live PostgreSQL checks are authorized.

Runtime harness: N/A for this code/catalog work unit; focused tests exercise form/payload boundaries, backend build verifies compilation, and SQL is statically inspected only. Live API/database acceptance and migration rerun/locking behavior remain pending for an authorized environment.

Rollback boundary: revert this feature commit to remove catalog additions, tests, schema/migration and documentation together. A database rollback is not performed or authorized; rows using the new codes would need consideration before narrowing a deployed CHECK.

## Results

- `TZ=America/Mexico_City node --experimental-strip-types --test 'app/(app)/investments/_lib/investment-form-model.test.ts'` (frontend cwd): RED 10 passed/4 failed before source edits; GREEN 14 passed/0 failed after implementation.
- `npm test` (frontend cwd): 268 passed, 0 failed (repeated once to capture untruncated totals).
- `npm run typecheck` (frontend cwd): passed. Restored generated tracked `tsconfig.tsbuildinfo` to its initial clean state; it is not part of this work unit.
- `dotnet build code.sln --no-restore`: passed, 0 warnings/0 errors; existing restore assets available.
- Python read-only assertions: PASS for ordered ten-code parity across frontend/form/domain/schema/migration, domain/frontend labels, BEGIN/COMMIT and named DROP IF EXISTS/ADD CHECK replacement.
- `git diff --check`: passed.
- `command -v rdd`: unavailable (exit 1); no read-only RDD assessment available. No native START or review performed.
- Node emitted existing MODULE_TYPELESS_PACKAGE_JSON warnings; tests still passed. No dependencies installed.
- SQL only inspected statically: live application, migration execution/rerun and locking remain unverified and unauthorized.
- Unrelated `odd/tasks/financial-dashboard-mobile-history.md` appeared during verification; left untouched and excluded from commit.
- Feature diff remains below the advisory 400-line budget.

## Memory mirror

Initial Engram mirror saved as observation 676 under project `gastosapp`, topic `odd/investment-institution-options/tasks`; completion mirror follows commit.

## Commit and handoff

Pending. Record the feature commit here after committing; this task-only followup may remain uncommitted to avoid a recursive commit loop. Native review is parent-owned.
