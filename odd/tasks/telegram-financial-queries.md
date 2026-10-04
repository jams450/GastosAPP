# Telegram financial queries

## Objective and authorization
Implement read-only Telegram financial queries authorized by user: cash accounts (`IsCredit=false`), credit accounts (`IsCredit=true`), available credit, dashboard monthly card payment, income/expense/net summaries for all/cash/credit, configured budgets and actual alert dispatch state. Images are explicitly out of scope for this phase.

## Constraints
Reuse existing deterministic financial calculations; never compute financial values through LLM. Identity comes from persisted Telegram identity; no model-supplied user ID. No schema changes, live DB/Telegram/LLM calls, deployments, secret inspection or `.env` edits. Preserve unrelated dirty files. User now explicitly authorizes a local commit for real-world testing; push/deployment remain user-owned. RDD enabled; native review and applicable functional checks required before completion.

## Tasks
- [x] T1 — Trace dashboard calculations, budget/alert query contracts and offline tests; derive narrow writer edit surfaces. Verified payment UI/DTO/SQL trace from mutxrx9z-2-e6ej: EstimatedCutoffCharges, CutoffPayments, CutoffPending; per-account cutoff cycle, not minimum or no-interest payment. No code changes or commit for read-only exploration.
- [x] T2a — Implement account/available-credit/filtered-summary tools, registration, tests and documentation. 275 authored lines; RED/GREEN observed; independent muty64xb-5-k466 passed harness plus50 and solution build zero warnings/errors, no severe diff issues. Native review tracked separately T4; no commit authorized.
- [x] T2b — Implement cutoff-payment query with existing dashboard fields, registration, cycle/aggregate tests and documentation. +121 incremental lines, RED/GREEN; independent mutyemzu-8-doui confirmed exact dashboard mapping, harness PASS and full build zero warnings/errors. Offline only; native review separate T4, no commit authorized.
- [x] T3a — Implement budget configuration/status query with registration/tests/docs. 193 incremental lines, RED/GREEN; independent verifier mutyo5ey-b-xcp4 passed all offline suites and solution build with zero warnings/errors, no severe issues. Inactives, thresholds, exact mapping and mandatory dependency verified. No live DB proof; native review tracked T4; no commit authorized.
- [x] T3b — Implement budget alert dispatch-state query with registration/tests/docs. 196 incremental lines; RED/GREEN all suites+50; independent final verifier mutyyli9-e-nbao passed harness, full solution build zero warnings/errors and whitespace checks, no severe caused issues. Scope threshold delivery history only; no read receipts. No commit authorized; native review T4 pending.
- [ ] T4 — Independently verify build/tests, perform enabled native review and report pending checks. Functional offline verification complete. BLOCKED: native review must isolate feature from unrelated tracked changes and preserve bounded review slices; no START or lineage created. Need user decision on isolated review preparation; no delivery/commit authority.

## Review slicing
Worker forecast 450–550 authored lines for combined T2, stopped without edits. User explicitly selected split into two units: T2a accounts/available-credit/summaries and T2b cutoff payment, each with registration/tests/docs. Same six narrow authorized surfaces. Baseline passed 50 deterministic outcomes. No commit authorization granted.

## Acceptance
- Cash/credit classification matches `IsCredit` and totals include correct authorized accounts.
- Credit payment and summary semantics match dashboard, including periods and avoidance of duplicate purchase/payment counting.
- Queries use current month by default and support explicit periods consistent with existing timezone rules.
- Budgets reflect service fields; alerts distinguish reached threshold, queued, sent and failed; sent is not read receipt.
- All tools remain read-only and user-scoped; no mutations or transaction draft loss caused by financial queries.
- Existing conversation confirmation, account resolution and idempotency behavior remains intact.

## Evidence and progress
Initial exploration mutxnl7n-1-8sxl completed: existing offline Telegram harness, dashboard cash/credit summaries, available credit and budget/delivery queries mapped. Payment trace delegated as mutxrx9z-2-e6ej. One bounded writer mutxthiu-3-7tmr started for independent account queries; budget/alert work not started. Runtime `gentle-ai review mode status`: on, global. Existing dirty files `.atl/.skill-registry.cache.json`, `.atl/skill-registry.md`, `odd/tasks/investment-institution-options.md` must remain unchanged by this feature. `docs/PLAN_TELEGRAM_CONSULTAS_E_IMAGENES.md` contains saved plan from previous authorized documentation edits.

## Checks
T2a writer: baseline50; RED CS0246/CS1061; GREEN financial query checks plus 50 existing outcomes; whitespace clean. Independent verification passed financial harness +50 and `dotnet build code.sln` (zero warnings/errors); no severe issues. No real PostgreSQL/LLM/Telegram proof. Natural tool selection depends on existing LLM classifier, not deterministically proved.
Native INSPECT performed: preflight blocked on intended-untracked selection, no lineage created. Workspace projection includes preexisting tracked .atl/investment changes; do not start an overbroad review without resolving candidate scope. New unit files must be included in intended-untracked scope when a safe candidate is established.
Offline harness: `dotnet run --project GastosApp.Telegram.Tests/GastosApp.Telegram.Tests.csproj`. Applicable deterministic tests through fake dashboard and actual tool contracts; writer requested baseline/RED/GREEN. Full build and focused tests through verifier. No live integrations authorized. Work-unit commits pending explicit user authorization.

## Next step
User authorized local commit and will perform real-world testing. Commit only feature code/tests/docs and tracking on a feature branch; preserve unrelated changes. Native review remains pending and is distinct from deployment/live testing. No push/deployment authorized. Record commit identity in memory after commit; do not claim review approved. Native candidate isolation unresolved due preexisting tracked changes; no commits authorized. Update mirror and TODO at transitions.
