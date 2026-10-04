# Validate application session before showing private UI

## Objective and constraints
Prevent a locally valid encrypted cookie from presenting an authenticated interface when the API rejects the underlying session. Explain current cookie/access/refresh lifetime; keep lifetimes unchanged. Cloudflare Access is a separate security layer. Never inspect secret values or change server/Cloudflare settings. Preserve existing unrelated worktree changes. User explicitly authorized the implementation commit. Publishing and deployment remain unauthorized.

## Tasks
- [x] T1 — Add authoritative bootstrap session validation and a private UI gate, with deterministic regression tests and RED/GREEN evidence. Worker finished; 16 focused tests pass, initial RED was missing module.
- [ ] T2 — Independent automated checks passed; browser checks and final native acknowledgement remain blocked. Final native START returned lens_context_budget_exceeded with no authority created; no automatic retry or commits.
- [x] T3 — Report verified behavior, cookie lifetime and runtime/deployment limitations. Prepared final handoff; no deployment.

## Acceptance
- Invalid or revoked non-renewable sessions redirect to login before private content mounts.
- Expired access tokens with a valid refresh recover and persist the refreshed cookie.
- Temporary API failures block the private UI with retry, not a false authenticated state or false logout.
- Missing/expired/rejected sessions clear application session cookies.
- Cookie lifetime remains unchanged; no secret contents enter output.

## Verification
Use existing frontend Node test runner and deterministic mocked fetch tests. Observe RED before implementation, GREEN afterward. Run full frontend tests, typecheck and relevant lint/build using existing dependencies only; no live DB or deployment changes. Native review and functional verification are separate. Record unavailable checks explicitly.

## Progress
Read-only exploration confirms middleware, SSR guards and session route only check the encrypted local cookie. API validates JWT/session against DB. Repository starts on main with unrelated changes to .atl registry files and odd/tasks/investment-institution-options.md, which are outside scope.

## Next step
Writer muu18zcs-3-e8do completed one bounded frontend unit on fix/initial-session-validation. Independent verification: full npm test, targeted ESLint and npm run build passed. Typecheck initially failed at session-validation.test.ts:93 (BootstrapState inferred as never); muu1nhfe-7-yu01 fixed assertion narrowing, observed RED then GREEN typecheck and 16/16 focused tests. Final independent rerun muu1pcac-9-18dt: 284 tests passed, 0 failures/skips; typecheck with incremental false and targeted lint passed; diff check passed. Browser verification muu1nxwn-8-1jyt could not run because child session lacks MCP/browser-control tools; no server started, browser checks remain explicitly unverified. Native review review-6e03c60388eb84c9 approved the initial immutable candidate with nonblocking findings; build changed tracked tsconfig.tsbuildinfo before acknowledgement, so current STATUS returned unrelated/start and no authority burn is claimed. A client gate is necessary because SSR cannot persist refreshed cookies; authoritative BFF session validation probes a protected read endpoint. Commit authorized by the user's explicit `commit` request; stage only this feature's source, tests and task document. Exclude unrelated changes and generated tsconfig.tsbuildinfo. Commit identity will be recorded in the Engram handoff.

Final review: a fresh START for the corrected candidate failed preflight with lens_context_budget_exceeded; no authority created. Build-generated tracked tsconfig.tsbuildinfo remains present and expands review evidence. Initial review approval does not cover the corrected candidate; no acknowledgement burn claimed. Browser verification remains pending.

Lifetime evidence: access defaults to 2 hours; refresh defaults to 30 days; encrypted cookie expiry follows refresh expiry (access fallback). Numeric-only extraction found no numeric overrides for the two lifetime keys in local appsettings; production runtime overrides remain unverified. No secrets were printed.
