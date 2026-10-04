# Financial dashboard hierarchy and mobile transaction history

## Objective
Improve dashboard information hierarchy by reducing repeated introductory header content and prioritizing key metrics. Make transaction history compact and readable on mobile while retaining full desktop data and existing behavior.

## Scope
- Dashboard presentation within `GastosApp.Web/app/(app)/dashboard/**`.
- History presentation within `GastosApp.Web/app/(app)/transactions/history/**`.
- Shared data-grid only if a scoped, backward-compatible presentation extension is needed.
- No calculation, API, filtering, sorting, or pagination behavior changes.

## Checks
- [x] Identified Node built-in test runner via `package.json`; focused dashboard metric/tab tests passed.
- [x] `npm --prefix GastosApp.Web run lint` — passed with 9 pre-existing unused-variable warnings.
- [x] User-directed refinement: expanded both metric groups to full available width, applied green income, red expense, purple credit, and highlighted financial net; removed duplicate primary income/expense cards and retained original summary values.
- [x] `npm --prefix GastosApp.Web run build` — passed; existing warnings remain.
- [x] Reviewed diff: desktop DataGrid markup remains intact at `md+`; dashboard metric calculations and transaction API/filter/pagination wiring unchanged.

## Progress
- [x] Confirmed clean initial worktree on `main`; created feature branch `feature/financial-dashboard-mobile-history`.
- [x] Reviewed dashboard/history dependency map with CodeGraph before edits.
- [x] Inspected dashboard/history presentation, DataGrid callers, package scripts, and focused tests.
- [x] Removed the added primary income/expense cards after user reported duplicate income, expense, and net values; retained original summary block. Repeated dashboard intro subtitle remains reduced.
- [x] Added opt-in responsive card layout to shared DataGrid and enabled it for regular transaction history only; desktop table behavior retained.

## Expected authored lines
Dashboard hierarchy: approximately 20–60 lines. Mobile history presentation: approximately 30–80 lines. Task evidence: approximately 15–30 lines. Final implementation used 30 dashboard lines, 38 history-panel lines, and a 13-line opt-in DataGrid extension; dashboard calculations and backend behavior remained unchanged.

## Verification evidence
- `npm --prefix GastosApp.Web run test -- 'app/(app)/dashboard/_lib/dashboard-metrics.test.ts' 'app/(app)/dashboard/_lib/dashboard-tabs.test.ts'` — passed (the npm script runs its configured suite).
- `npm --prefix GastosApp.Web run lint` — passed; 9 existing warnings in other files.
- `npm --prefix GastosApp.Web run build` — passed; production compile and type validation succeeded.
