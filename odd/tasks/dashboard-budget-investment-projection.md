# Dashboard budget and investment projection

## Objective
Improve future monthly dashboard net using budgets, estimated investment returns, and MSI commitments.

## Accepted rules
- Pending budget income minus pending budget expenses replaces historical net entirely for months with pending budget items. Historical fallback only when no pending plan items exist.
- Budget expenses exclude MSI installments by user convention. Subtract MSI separately; no automatic deduplication or schema change. Explain this assumption in the UI.
- Investment earnings are estimates, not booked transactions or liquid cash. Show them separately and include them in estimated economic net, not actual cash.
- Preserve user scoping, timezone month alignment, and existing API compatibility.
- No fabricated investment drafts as saved plans; use valid persisted plans and month-aligned projection rows.

## Scope and constraints
Backend dashboard aggregation and DTO; frontend contract, projection chart and explanatory copy; focused regression tests. No database changes, publishing, or unrelated edits.
Preserve pre-existing changes: .atl/.skill-registry.cache.json, .atl/skill-registry.md, GastosApp.Web/tsconfig.tsbuildinfo, odd/tasks/investment-institution-options.md.
Commit policy: no commits without explicit user request. Work-unit commits pending user authorization.

## Tasks
- [x] T1 (verified implementation; commit pending authorization): Implement plan-aware backend projection and compatible monthly breakdown with applicable deterministic regression coverage.
- [x] T2 (implementation and deterministic checks verified; live authenticated smoke pending): Display budget basis, investment estimates and after-MSI net in dashboard; add contract/chart regression tests and verify integration.

- [ ] T3 (pending; authenticated access unavailable): Validate dashboard rendering and live API with an available authenticated session.
- [ ] T4 (pending; package-local binary unavailable): Restore native review availability with user authorization and run review.

## Acceptance and checks
- Budget month replaces trend, including zero amounts; empty month uses trend.
- Pending only, correct user and month; executed/ignored/cancelled items excluded.
- Investment month alignment, missing/draft plan fallback, and no cash/estimate conflation.
- MSI deducted exactly once from displayed final net under accepted budget convention.
- Test-first where runnable deterministic tests apply: observe RED then GREEN; document backend fallback if no suitable runner.
- dotnet build code.sln; cd GastosApp.Web && npm test; typecheck with incremental disabled to protect existing tsbuildinfo.
- Authenticated API and browser smoke when environment/access permits; report unavailable checks explicitly.
- Native review only when user-owned RDD mode enabled; assessment dictates independent verification.

## Evidence
Exploration completed. Backend currently projects constant historical regression net, with MSI only in balance scenario. BudgetItem lacks MSI linkage; explicit user convention resolves scope without schema changes. Investment yields are estimated only.
T1 writer checks: dotnet build code.sln passed (0 warnings/errors); standalone dashboard console tests observed RED then GREEN, 25 outcomes passed. Investment selection: latest persisted covering plan, saved allocation snapshot, exact month; none => zero. Parent spot-read calculator completed. Native assessment unavailable (package-local-binary-missing), independent verifier required. Independent backend verification passed same build and 25 outcomes; frontend independent verification passed 296 tests and nonincremental TypeScript check. Parent spot check: 25 focused frontend tests pass and git diff --check clean. Corrected metric note to clarify pending and projected recurrences are estimates, not confirmed income.
Commits: none; authorization pending.

## Next step
User validates authenticated dashboard in existing session; live DB/API and dashboard visual smoke not performed (authentication creates session record, no approved access). Native RDD on globally, inspect blocked package-local-binary-missing, no lineage/mutation; review unavailable, not approved. No commits/push.

## Remaining verification limits
- Authenticated API and dashboard chart browser render pending. Unauthenticated browser reached login correctly; BFF projection returned 401. Login page visuals do not verify dashboard visuals.
- Native review cannot start until package-local binary restored by user; no review approval claimed.
- New backend console test runner intentionally outside code.sln; run its explicit command.

## Extension: two decision scenarios
User authorized saved-data base plus deviation-adjusted scenario. Headline net must show base plan/historical origin; frontend names and explains both methods.
- Base uses planned pending income/expenses, investment estimates, MSI and open normal Revolving installments by due month. Budget convention excludes both MSI and normal credit payments/financed purchases from cash expenses. No unsupported minimum payment inference.
- Adjusted = base plus mean net deviation over last 3 complete months: actual minus planned income, planned minus actual expenses, plus unplanned income minus unplanned expenses. Exclude credit settlement transfers and financed purchases from cash deviation; deterministic linking/user/period filters. Only months with meaningful plan comparison count; disclose sample and period, no sufficient data => zero adjustment with warning. Avoid treating every cash transaction as a deviation if no historical plan exists.
- Preserve investment estimate/cash separation. No schema changes. Do not change overdue behavior silently: future by due month, disclose overdue exclusions if relevant.

## Extension tasks
- [x] T5 (B1 correction independently verified): Add normal credit schedule, historical deviation provenance, both monthly nets and deterministic backend tests.
- [x] T6 (independent 308 tests and TypeScript passed; mixed-basis label corrected): Frontend method comparison/selection and net basis breakdown, tests.
- [x] T7 (independent checks completed; live smoke/native review remain T3/T4): Independent verification and parent spot check; document live smoke/native limitations.

## Extension verification
Run dotnet build code.sln; dotnet run --project GastosApp.Dashboard.Tests/GastosApp.Dashboard.Tests.csproj; cd GastosApp.Web && npm test; cd GastosApp.Web && npx tsc --noEmit --incremental false. Test-first applicable behavior changes. No commits/push requested.

### T5 evidence
Writer observed RED then GREEN: 49 backend outcomes pass; build 0 warnings/errors. Base uses settlement-free historical income/expense to avoid double credit subtraction. Three complete budget-backed periods required for deviation; pending past items count as unexecuted plan, linked financed executions excluded. Legacy fields preserved. Overdue installments outside future horizon excluded, must be disclosed. Native assessment unassessable due untracked scope declaration; independent verification required.

### Independent verification follow-up
B1 confirmed: pending BudgetItem.AccountId credit assignment was ignored in future budget basis and prior deviation, risking double outflow and false savings. T5 reopened, bounded writer fixing account eligibility with test-first coverage. T6 independent checks passed 308 tests/typecheck; parent corrected mixed-horizon headline to show all bases, 37 focused tests pass. Cross-period linked executions currently suppressed outside plan window (known limitation); no product scope expansion. No native review started while blocker exists.

### B1 correction evidence
Writer resolves assigned accounts by owner in both queries; credit/unresolved pending rows excluded before budget grouping and from deviation comparisons. RED credit-only pending observation failure then GREEN 58 outcomes, build clean. Parent reran explicit dashboard test command: 58 pass; git diff --check clean. Independent re-verification dispatched, pending.

### Extension closure
Independent B1 re-verification: build 0 warnings/errors, 58 dashboard deterministic outcomes and 15 independent scratch probe outcomes pass; no blockers. Both account-classification paths verified. Frontend independently 308 tests/typecheck pass, mixed-source headline fixed, parent 37 focused frontend checks pass. No live authenticated DB/API or dashboard rendering exercised. Native inspect now available but requires intended untracked scope; no native lineage/review outcome created. T3/T4 remain pending. Cross-period linking and overdue exclusions disclosed limitations, no inferred minimum payment. No commits/push.
