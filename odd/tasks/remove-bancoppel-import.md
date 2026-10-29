# Remove the unused Bancoppel statement import
Objective: delete the BanCoppel PDF import end to end; nothing in the repo consumes it.
Branch: feat/email-expense-ingestion (first work-unit commit); no push, no deployment.

## Specs
S1. «tambien agrega lo de quitar de bancoppel que nunca se utilizo»
S2. Selected option: «Migración fechada con DROP» — keep `2026-09-07_bancoppel_imported_rows.sql`
    in the manifest as history and add a dated file that runs `DROP TABLE IF EXISTS`.

## Tasks
- T1 [pending] S1: remove both `/api/transactions/import/bancoppel/*` endpoints, the three API DTOs,
  `IBancoppelImportService`, `BancoppelImportService`, `BancoppelImportModels`, the
  `BancoppelImportedRow` entity, its DbContext mapping and the two `IRepository`/`Repository` claim
  methods, plus the now-unused `UglyToad.PdfPig` package; delete the `API_DOCUMENTATION.md` section.
- T2 [pending] S1,S2: add `SQL/migrations/2026-10-29_drop_bancoppel_imported_rows.sql` with its
  manifest entry, and remove the table from `SQL/schema.sql`.
- T3 [pending] S1: `dotnet build code.sln` and `dotnet test` clean, with the migration ledger test
  proving manifest and disk still agree.

## Log
L1. User request verbatim: «tambien agrega lo de quitar de bancoppel que nunca se utilizo».
L2. Exploration at 2026-10-29: the feature surface is 12 source files, two SQL files and one doc
    section. No web UI and no test reference it, so removal is clean. `UglyToad.PdfPig` is
    referenced only by `BancoppelImportService`. `MigrationLedgerTests` pins manifest == disk.
L3. The `DROP` is destructive and stays unapplied: no database access is authorized in this session,
    so the file ships as a pending migration like the other dated files.
