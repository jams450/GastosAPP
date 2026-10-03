# Frontend section titles

## Objective
Give each rendered frontend route a descriptive Spanish browser title without an Amitzi Finance suffix. Preserve all other metadata, UI, authentication, and rendering behavior.

## Work unit
- [x] Add native static server metadata and verify coverage/lint/build; commit source plus this proof as one `fix` work unit.

## Scope and delegation
- Branch: `fix/frontend-section-titles`; one writer, no push.
- Exact source scope: `GastosApp.Web/app/layout.tsx`, rendered `GastosApp.Web/app/(app)/**/page.tsx`, and new `GastosApp.Web/app/login/layout.tsx`.
- Task artifact: `odd/tasks/frontend-section-titles.md`.
- Delegated route: preparation/multiple pages; parent owns native review. Do not start review here.
- Expected authored change: fewer than 200 lines.
- Redirect-only `/`, `/catalogs`, `/transactions`, and `/transactions/credit` need no title; no edits made there.
- Rollback: revert this work unit to remove section metadata and restore the root title only.

## Checks
- Passive metadata change: no meaningful RED behavior test.
- Structural: every rendered page has a Spanish section title, login inherits a server layout title, no client page exports metadata, root has no branded template.
- Foreground: `npm --prefix GastosApp.Web run lint` and `npm --prefix GastosApp.Web run build`; both scripts confirmed present.
- Runtime harness: N/A for authenticated interaction; build and static metadata coverage validate this passive head-only change without session setup.
- No secrets or environment/config values inspected; no lockfile/generated-file edits permitted.

## Progress
- Preparation: clean `main` confirmed; feature branch created; CodeGraph explored before source inspection.
- Stack: Next.js 15.5.14 App Router, server section pages and client login page. Native metadata docs confirm exports belong on server pages/layouts.
- Engram mirror: saved to project `gastosapp`, topic `tasks/frontend-section-titles`.
- Installed stack verified from package metadata: Next.js 15.5.14, React/React DOM 19.2.6.
- Structural Python check: PASS, all 18 rendered routes covered; four redirect-only exceptions; root unbranded; client login unchanged and metadata in its server layout.
- `npm --prefix GastosApp.Web run lint`: exit 0, zero errors, nine unused-variable warnings in unchanged files; ESLint legacy-config deprecation warning.
- `npm --prefix GastosApp.Web run build`: exit 0; compilation, lint/types, and all 65 static-page generation steps passed. Same unused-variable warnings plus Node `module.register()` deprecation warning.
- Next automatically loaded its existing environment during build; no environment contents inspected or disclosed.
- Root description, icons, viewport, theme setup, and route behavior preserved. Parent review pending; no review START invoked.

## Title mapping
Paths below are relative to `GastosApp.Web/app/`; each row names an exact changed source file.

| Changed path | Browser title |
| --- | --- |
| `layout.tsx` | Finanzas personales (root fallback; no template) |
| `(app)/dashboard/page.tsx` | Panel de control |
| `(app)/accounts/page.tsx` | Cuentas |
| `(app)/accounts/[id]/page.tsx` | Resumen anual de cuenta |
| `(app)/budgets/page.tsx` | Presupuestos |
| `(app)/investments/page.tsx` | Inversiones |
| `(app)/users/page.tsx` | Usuarios |
| `(app)/catalogs/categories/page.tsx` | Categorías |
| `(app)/catalogs/subcategories/page.tsx` | Subcategorías |
| `(app)/catalogs/tags/page.tsx` | Etiquetas |
| `(app)/catalogs/merchants/page.tsx` | Comercios |
| `(app)/catalogs/billable-parties/page.tsx` | Entidades facturables |
| `(app)/catalogs/recurring-items/page.tsx` | Conceptos recurrentes |
| `(app)/transactions/expense/page.tsx` | Registrar gasto |
| `(app)/transactions/income/page.tsx` | Registrar ingreso |
| `(app)/transactions/transfers/page.tsx` | Transferencias |
| `(app)/transactions/history/page.tsx` | Historial de transacciones |
| `(app)/transactions/legacy/page.tsx` | Transacciones |
| `login/layout.tsx` | Iniciar sesión |
