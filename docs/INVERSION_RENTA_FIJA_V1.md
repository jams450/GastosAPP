# Fixed-income investments V1

## Final behavior

- A product belongs to one user and references exactly one active, non-credit account owned by that user. The account reference is immutable after creation. PostgreSQL permits at most one active product per user/account; application validation reports conflicts before persistence.
- Products and monthly offer captures are manually entered. Offers require an HTTPS source URL, a capture month, validity dates, explicit condition confirmation, and explicit marginal tiers. No rates are inferred or seeded.
- Generation reads each linked account's current balance at generation time. It creates/replaces the owner's single plan snapshot for the requested month. It does not create transactions or modify account balances, credit data, MSI, or installments.
- Every active product must have a confirmed, valid offer captured for the generated month with at least one tier. Otherwise generation fails with an explanation; there is no partial or inferred plan.
- Projection compounds only the captured marginal tiers. It has no starting amount field and no forecast contributions. Allocation, offer, confirmation, and tier snapshots are persisted; full generation version history is deferred.
- `/investments` has an admin UI guard. API endpoints remain authenticated and scoped through `UserWithId`; the service filters every product and plan by caller user ID.

## Deferred

Comparison is intentionally not exposed: under V1 each active account can drive only one active product and a plan is regenerated in place, so an API comparison endpoint would have no independent persisted scenarios to compare. Full plan-generation versioning and scenario comparison belong to a later version.
