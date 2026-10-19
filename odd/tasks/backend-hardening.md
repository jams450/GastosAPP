# Backend hardening from the security/performance/architecture review
Objective: close the reviewed backend findings (resilience, performance, architecture) with verified work-unit commits.
Branch: tracker `feat/backend-hardening` at dc3b4d5 plus five chained slice branches (see Slices). Separate work-unit commits, no push, no PR created, no merge. Checks: `dotnet build code.sln`, `dotnet test`, the existing console harnesses, and an independent `gentle-ai-verify` run for every high-risk unit.
Forecast: ~1090 authored changed lines (additions plus deletions), so the oversized-delivery strategy applies.
Delivery: user-selected `chain_strategy=feature-branch-chain` (verbatim answer in L3).

## Slices
Each slice is one branch cut from the previous slice tip, and its pull request is declared but never created: push and PR remain the user's decision.
- Slice 1 `feat/backend-hardening-tests` → T8. The safety net comes first so every later slice can be test-first.
- Slice 2 `feat/backend-hardening-resilience` → T1, T2, T3.
- Slice 3 `feat/backend-hardening-queries` → T4, T5, T6.
- Slice 4 `feat/backend-hardening-scoping` → T7.
- Slice 5 `feat/backend-hardening-hygiene` → T9.

## Specs
S1. «Requiro revision de seguridad, optimizacion, arquitectura etc. para cerrar esta face, tanto de front como back . prodemos empezar por back» — this document covers the backend; the frontend review is a later phase and stays out of scope here.
S2. «1 todo el alcancew» — the user authorized the complete scope: the resilience block, the performance block and the architecture block.
S3. «2 si en pro asi esta» — production runs behind a TLS reverse proxy, so the plain-HTTP finding (no `UseHttpsRedirection`/`UseHsts`, `5000:8080` published on the host) stays informational: no TLS, certificate or reverse-proxy work is included.
S4. Resilience: no process-wide infinite database command timeout; the public authentication endpoints are rate limited; a missing CORS origin list fails at startup in Production instead of silently falling back to localhost.
S5. Performance: day/month aggregation is computed in SQL; recurring averages do not issue one query per template; transaction reads do not pay for collection includes they do not consume, and page loads do not spend two round trips on one count; the LLM client is reused instead of rebuilt per message.
S6. Architecture: a new service can no longer forget user scoping; a new endpoint requires authentication by default; the dashboard suite is compiled by the solution build under a real test runner; a deployed instance can report which SQL migrations it has applied.
S7. Hygiene: unused credential entries leave the secrets file; a missing user-id claim returns 401 consistently instead of 500.

## Tasks
- T8 [ ] S6: real test runner, dashboard suite in the solution, migration ledger — slice 1, inline, one work-unit commit.
- T1 [ ] S4: repository command timeout — slice 2, inline, one work-unit commit.
- T2 [ ] S4: rate limiting on the auth endpoints — slice 2, inline, one work-unit commit.
- T3 [ ] S4: CORS fails fast in Production — slice 2, inline, one work-unit commit.
- T4 [ ] S5: day/month aggregation in SQL — slice 3, inline, one work-unit commit.
- T5 [ ] S5: recurring averages without the per-template query loop — slice 3, inline, one work-unit commit.
- T6 [ ] S5: split-query scoping and LLM client reuse — slice 3, inline, one work-unit commit.
- T7 [ ] S6: structural user scoping and default authorization policy — slice 4, inline, one work-unit commit.
- T9 [ ] S7: hygiene (dead credentials, consistent 401) — slice 5, inline, one work-unit commit.

## Log
L1. User request verbatim: «Requiro revision de seguridad, optimizacion, arquitectura etc. para cerrar esta face, tanto de front como back . prodemos empezar por back»
L2. Parent delivered a read-only prioritized review with path:line evidence for four areas (security, resilience, performance, architecture). Baseline verified at dc3b4d5: `dotnet build code.sln` 0 errors/0 warnings; `GastosApp.Telegram.Tests` and `GastosApp.Dashboard.Tests` both pass. Working tree clean except `docs/ntfy.env.example`.
L3. User answers verbatim: «1 todo el alcancew 2 si en pro asi esta» — the full three-block scope is authorized, and production is behind TLS so the HTTP/TLS finding is informational only.
L4. Native review is unavailable in this environment: the `gentle-ai` executable does not exist on this host (only the `~/.gentle-shell/agent/gentle-ai/` data directory), so the user-owned RDD switch cannot be read and no native START, consent or assess route is offered. Verification therefore follows the ordinary risk tier: parent checks plus an independent `gentle-ai-verify` run for every high-risk unit, and no RDD ceremony is invented.
L5. Known high-risk items in this change set (Task Size list): (1) the recurring-average, aggregation and split-query work sits on money-reading paths; (2) the auth rate limiter and the default authorization policy are security surfaces; (3) the user-scoping change alters a contract every service consumes. Each of T4, T5, T7 and T8 therefore requires the independent verifier.
L7. Delivery decision recorded: the parent asked the ordered oversized-delivery menu (Spanish, three options, strategy tokens untranslated) because the forecast exceeds ~400 authored lines; the user selected «1. Cadena de ramas por feature (recomendado)» → `chain_strategy=feature-branch-chain`. Slice boundaries above are the frozen record. Rationale accepted: it keeps the repository's existing habit of work-unit commits with no push.
L8. Routing: writer parallelism was considered for T4/T5/T8 and rejected on evidence — the units share one solution, so concurrent `dotnet build`/`dotnet test` in one worktree collides on `obj`/`bin` locks, and isolated worktrees would break the single chained-slice branch shape the user chose. Units therefore run inline and sequentially, and the mandatory independent `gentle-ai-verify` run per high-risk unit is the outside view.
L9. Prerequisite validated before planning: `dotnet restore` has network access and a scaffolded xunit probe passes (`dotnet test` → Passed: 1), so a real runner is feasible; the repository's console harnesses remain in place as the existing regression net.
L6. Not authorized by this document: schema or data mutation, applying the pending `SQL/migrations` files to any live database, push, pull request, merge to main, or deployment.
