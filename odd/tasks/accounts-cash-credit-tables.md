# Separate cash and credit account catalog
Objective: two account tables with canonical credit metrics, no data changes.
Branch: feat/accounts-cash-credit-tables; separate work-unit commits, no push. Checks: existing .NET console harness, build, frontend Node tests, nonincremental TypeScript.

## Specs
S1. «entonces en el catalogo de cuentas mejorar las columnas o tener 2 tablas para credito y efectivo»
S2. Selected option: «Dos tablas en la misma página — recomendado»; «Efectivo: saldo actual e inicial. Crédito: línea, deuda normal/MSI, total y disponible canónicos; saldo contable en detalle/historial. Conserva filtros y acciones.»
S3. «has commit cortos para tus cambios y tener el historial, no puedes hacer push»
S4. «no crear muchas unit test sin valor, puedes instalar los componentes faltantes o librerias nuevas»

## Tasks
- T1 [done] S1-S4: canonical credit list fields committed abae525; independent verification without code blockers, parent 93 checks and build clean. Inactive/owner/Posted/per-installment rules verified by isolated probes and code inspection, not live DB. Compile-only RED not behavioral proof.
- T2 [done] S1-S4: two desktop/mobile catalog sections committed 592bac5; parent and independent TypeScript/320 tests pass. Missing values remain unavailable; filters/actions/history preserved. No authenticated browser proof.
- T3 [done] S1-S4: parent seam checks and independent mvbpwahy-n-nnd9 approved without code blockers, nine independent calculator probes pass. Commit-only closure blocker resolved by abae525 and 592bac5. No DB/login/migration/push or merge to main. Initial native assessment unassessable; independent verification performed.

## Log
L1. User request verbatim: «entonces en el catalogo de cuentas mejorar las columnas o tener 2 tablas para credito y efectivo». User selected S2 option in interactive choice.
L2. Baseline main 4d427ac, clean initial tree; branch created before source edits. Exploration mvbpeksp-k-q8ir maps GET /api/accounts as all-owned (not active-only), AccountResponse lacks debt fields. Parent spot-checked controller. Canonical debt: outstanding Open/PartiallyPaid/Overdue installment total minus Posted payment allocations, floored per installment, split Revolving/MSI; total sum, available limit minus total, null without limit. Never infer debt from CurrentBalance.
L3. Backend design: additive nullable list response fields normalOutstanding, msiOutstanding, currentDebt, creditAvailable. Prefer one owner-scoped aggregate read, no schema migration or dashboard active-only function dependency. Cash contract and existing endpoints remain compatible. Missing fields are unavailable, not zero. Keep over-limit negative available and inactive rows.
L4. No production/DB/API/login access authorized for this work. No schema/function mutation, balance recalculation, data writes, push or deployment. Previous cutoff migration remains unapplied. Existing console tests use dotnet run, not dotnet test. Browser authenticated proof unavailable; do not invent it.
