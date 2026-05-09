# Dashboard SQL extraction plan

## Objective
- Move `DashboardService` inline SQL into DB function.
- Remove direct `ContextSqlGastos` dependency from service.
- Route data access through repository abstraction.

## Scope
- `GastosApp.BusinessLogic/Services/DashboardService.cs`
- `GastosApp.BusinessLogic/Interfaces/IDashboardService.cs`
- `GastosApp.BusinessLogic/Interfaces/IRepository.cs`
- New migration SQL function in `SQL/migrations/`
- New SQL row model file under `GastosApp.BusinessLogic/Models/Dashboard/Sql/`

## Phase 1: DB migration (done in this PR)
- Create function: `fn_dashboard_credit_overview(...)` returning full dashboard rowset.
- Add supporting indexes:
  - `transactions(transfer_group_id, transaction_id)` partial for non-null transfer groups
  - `credit_installments(status)`
  - `credit_payments(status)`
- Keep query semantics identical to current raw SQL.

## Phase 2: Repository contract extension
- Extend `IRepository` with typed SQL query method:

```csharp
Task<List<T>> SqlQueryAsync<T>(string sql, params object[] parameters) where T : class;
```

- Implement in `Repository` with `_context.Database.SqlQueryRaw<T>(...)`.

Reason:
- Avoid direct `ContextSqlGastos` usage in `DashboardService`.

## Phase 3: Dashboard read model extraction
- Move internal class `DashboardAccountSqlRow` to dedicated file:
  - `GastosApp.BusinessLogic/Models/Dashboard/Sql/DashboardAccountSqlRow.cs`
- Keep properties aligned with SQL function result columns.

Reason:
- Improves testability and separation of concerns.

## Phase 4: Service refactor
- Update constructor:
  - from `ContextSqlGastos` to `IRepository`.
- Replace inline SQL string with function call:

```sql
SELECT *
FROM fn_dashboard_credit_overview(
  @userId, @monthStart, @nextMonthStart,
  @yearValue, @monthValue, @daysInMonth,
  @previousYear, @previousMonth, @previousDaysInMonth
)
```

- Keep current mapping + summary calculation unchanged initially.

## Phase 5: Cleanups and hardening
- Extract month/timezone helpers to dedicated utility file.
- Add platform-safe timezone fallback strategy (IANA + Windows mapping).
- Optional: replace `lower(t.type)` with normalized persisted values after data backfill.

## Validation plan
1. Run migration SQL in dev DB.
2. Run `dotnet build code.sln`.
3. Smoke endpoint: `GET /api/dashboard/credit-overview?month=YYYY-MM`.
4. Compare old vs new payload values for at least:
   - one cash account
   - one credit account with MSI
   - one account with transfers
5. Check query plan for function execution and index usage (`EXPLAIN ANALYZE`).

## Rollback plan
- Revert service call to previous inline SQL.
- Keep function in DB harmlessly (or drop explicitly):

```sql
DROP FUNCTION IF EXISTS fn_dashboard_credit_overview(
  INT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, INT, INT, INT
);
```

## Risks
- Subtle behavior drift if function edits diverge from original query.
- Timezone parsing fallback differences across Linux/Windows.
- Existing data with `balance_impact = 0` relies on legacy fallback CASE logic.

## Acceptance criteria
- No direct `ContextSqlGastos` dependency in `DashboardService`.
- Dashboard payload unchanged for same user/month dataset.
- Build green.
- Migration applied without errors.
