# Link budget items to actual transactions

## Objective
Allow a planned budget item to consume an actual expense even when automatic matching cannot confidently identify it, and support recording an expense from the item.

## User intent and accepted decisions
- User has planned items and real expenses that can differ month to month; amount/category matching is not reliable enough.
- Support both linking an already-recorded expense and creating an expense from a planned item.
- For manual linking, require matching month and category/subcategory; actual amount may differ and is authoritative.
- Creating from an item should prefill planned amount but allow editing the actual amount.
- Preserve existing manual expense entry and automatic matching behavior.

## Constraints
- User-scoped ownership and transaction/item uniqueness must be enforced server-side.
- `executed` status is derived from a transaction link; do not add a manual status transition.
- Preserve the existing transaction-creation post-commit auto-match contract.
- Do not touch unrelated concurrent working-tree changes.
- Branch: `feature/link-budget-item-transactions`.

## Tasks
- [x] T1 Map budget-item and transaction contracts, routes, and matching rules.
- [x] T2 Decide the link constraints and create-from-item amount behavior with the user.
- [x] T3 Add safe server-side manual link operation and frontend selection of an existing expense.
- [x] T4 Add create-expense-from-item flow with editable amount and automatic item link.
- [x] T5 Run focused frontend checks and backend build; document unavailable runtime checks.

## Acceptance criteria
- A pending expense item can be linked to one existing same-user expense in the same month and matching category/subcategory, regardless of amount.
- A linked item becomes executed and the actual transaction amount feeds budget totals.
- A new expense can be initiated from a pending item with planned amount prefilled and editable; successful creation links the transaction to that item.
- Invalid ownership, month/type/scope mismatch, already-linked item or transaction is rejected without partial effects.
- Existing manual transaction and budget-item flows remain available.

## Route and verification plan
- Delegated multi-file implementation to one bounded `gentle-ai-worker`; independent verification delegated to `gentle-ai-verify` after native ASSESS returned unassessable. Parent owns this document and reconciliation.
- Expected authored implementation exceeded the initial ~400-line estimate (about 1,100 net changed lines in all working-tree paths, including unrelated existing modifications); human-review workload is larger than anticipated. Do not split coherent behavior artificially.
- Focused frontend tests: `TZ=America/Mexico_City node --experimental-strip-types --test 'app/(app)/budgets/_lib/budget-suggestions-model.test.ts' 'app/(app)/budgets/_lib/budget-template-occurrence.test.ts'` — 14/14 pass.
- Frontend ESLint on six authorized surfaces — pass.
- `dotnet build code.sln --no-restore` — pass, 0 warnings/errors.
- `git diff --check` — pass.
- `npm run typecheck -- --incremental false` — blocked by unrelated dirty `GastosApp.Web/app/(app)/transactions/_hooks/use-history-columns.tsx:182` duplicate `className`; no feature-file diagnostics.
- Runtime DB/browser flow not exercised; remains pending.

## Progress and implementation
- Manual link endpoint: GET item candidates and POST link; server validates same owner, month, kind, category/subcategory and enforces item lock + transaction uniqueness. Actual amount is authoritative.
- Create expense from pending item: planned amount prefilled and editable; item eligibility validated before creating expense, explicit link follows commit; automatic matcher remains intact.
- Budget Partidas and suggestions panels expose linking; expense items expose create-from-item.
- Independent review found two low-severity edge cases: controller may return 500 if the linked item is deleted between commit and re-read (link itself remains committed); candidate list GET does not filter inactive item status though UI only offers action for pending items. Runtime/db and browser behavior remain unverified.
- Source implementation and checks complete. No commit created; ODD work-unit commit required before implementation can be reported complete.
