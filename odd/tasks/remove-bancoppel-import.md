# Remove the unused Bancoppel statement import
Objective: delete the BanCoppel PDF import end to end; nothing in the repo consumes it.
Branch: feat/email-expense-ingestion (first work-unit commit); no push, no deployment.

## Specs
S1. «tambien agrega lo de quitar de bancoppel que nunca se utilizo»
S2. Selected option: «Migración fechada con DROP» — keep `2026-09-07_bancoppel_imported_rows.sql`
    in the manifest as history and add a dated file that runs `DROP TABLE IF EXISTS`.

## Tasks
- T1 [done] S1: removed both `/api/transactions/import/bancoppel/*` endpoints, the three API DTOs,
  `IBancoppelImportService`, `BancoppelImportService`, `BancoppelImportModels`, the
  `BancoppelImportedRow` entity, its DbContext mapping, the two `IRepository`/`Repository` claim
  methods, the `UglyToad.PdfPig` package and the `API_DOCUMENTATION.md` section; one stale comment
  in `TransactionCommandService` that still cited the import was rewritten. Committed 7db2e1c.
- T2 [done] S1,S2: `SQL/migrations/2026-10-29_drop_bancoppel_imported_rows.sql` (`DROP TABLE IF
  EXISTS`, unapplied) with its manifest entry, and the table plus its index removed from
  `SQL/schema.sql`. Committed 7db2e1c.
- T3 [done] S1: `dotnet build code.sln` clean with 0 warnings, `dotnet test code.sln` 115 passed and
  0 failed — including `MigrationLedgerTests`, which proves manifest and disk still agree.
  Committed 7db2e1c.

## Log
L1. User request verbatim: «tambien agrega lo de quitar de bancoppel que nunca se utilizo».
L2. Exploration at 2026-10-29: the feature surface is 12 source files, two SQL files and one doc
    section. No web UI and no test reference it, so removal is clean. `UglyToad.PdfPig` is
    referenced only by `BancoppelImportService`. `MigrationLedgerTests` pins manifest == disk.
L3. The `DROP` is destructive and stays unapplied: no database access is authorized in this session,
    so the file ships as a pending migration like the other dated files.
L4. Result: 19 files staged for this work unit, 40 insertions and 812 deletions; unrelated worktree
    files (`.atl` registry, `tsconfig.tsbuildinfo`, an untracked script) were deliberately left out.
    Residual references to the import exist only in the two migration files that must keep its name,
    the manifest, and this document.
