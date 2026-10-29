# Email-driven expense drafts
Objective: classify the mailbox by metadata, extract what it can, and park every candidate as a
draft. Never write `transactions` without a human confirming.
Branch: feat/email-expense-ingestion; work-unit commits, no push.

## Specs
S1. «ahora requiero meter los gastos en automatico, por ahora vamos a leer correo y de ahi sacar gastos»
S2. «principalmente solo algunas cuentas mandan correo y otras estan debajo de paypal asi que seria
    obtener correos relacionados crear gasto con los datos que puedan y dejarlo solo como draft para
    meter datos faltantes categoria negocio etc»
S3. «Todo el correo pero podemos clasificar por metadatos en ves de leer cada asunto por llm , por
    ejemplo mas de 2 anos por eliminar , correos de openbank, revolut, bbva etc pues banco, amazon
    paypal etc a gastos, y asi evitamso token y dentro de cada uno podemos revisar si el recibo o
    nuevos tc etc no todo debe pasar por llm para clasificar»
S4. «el clasificador lee todo el inbox general y el de gastos solo carpeta gastos»
S5. «En la tarjeta -> cuenta que tenemos por lo tanto debemos tener campo de tarjeta para las cuentas
    que no se tiene»
S6. Selected option: «IMAP + contraseña de aplicación» over the Gmail API, because `gmail.readonly`
    is a restricted scope: publishing the app needs verification plus a security assessment, and
    staying in Testing expires the refresh token every 7 days.
S7. Selected option: «Parser con .eml guardados» — the first deliverable parses saved messages, with
    no mailbox credentials and no OAuth.
S8. «Podemos empezar con clasificador general y que en la app podamos tener reglas configurables
    tipo si llega de x a x etiqueta/carpeta y termina con tal a x etc etc?» — the classifier is a
    general rule engine whose rules the user edits in the app, not a hardcoded sender list.
S9. «Vamos con toda la seccion de clasificador de correo -> primero catalogo de etiquetas y carpetas
    para correso luego catalogo de reglas vamos a colocar justo sender, sender_domain subject y
    agregar llm que clasifique por llm con base a las categorias seria el fallback para ciertos
    escenarios no se si colocamos una de otro generica que si no entra lo metemos en ese?» — order
    is labels first, then rules, then the LLM fallback; and the open question is whether unmatched
    mail lands in one generic bucket.
S10. Answer to the S9 question, as a model rather than a name: the behaviour belongs to the label,
    not to the label's name. `email_labels.behavior` is one of `expense`, `income`, `ignore`, `none`.
    A label named «Otros» is therefore a normal label with `behavior = none` — it classifies without
    creating a draft. That makes both candidate designs one rule row apart instead of one code
    change apart, so the engine needs no special case for a catch-all.
S11. «Adicional dentro de la app modulo de test de correo para tomar x muestra de top ### y fechas del
    correo para ir probando» — a sampling screen that pulls the top N messages plus a date range and
    shows what the classifier would do with them, without touching the pipeline.

## Tasks
- T1 [pending] S1,S3,S4,S9,S10: schema — `email_labels` (user, name, kind folder/label, behavior,
  colour, system flag, sort order), `email_rules` (match field sender/sender_domain/subject, match
  type, value, target label, priority, active), `email_messages` (one row per RFC822 `Message-ID`,
  mailbox, UID, received date, label, state, matched rule, failure), `email_expense_drafts`
  (nullable draft fields, raw text, card hint, status, TTL, `transaction_id`). Dated migration plus
  `SQL/schema.sql` and the manifest.
- T2 [pending] S9,S10: labels catalog — entity, service, CRUD controller and the catalogs UI section,
  including the four behaviours and a seeded system set.
- T3 [pending] S9: rules catalog — CRUD API and UI with the three match fields, target label,
  priority and active, mirroring `CatalogRulesController`.
- T4 [pending] S3,S8,S10: deterministic engine — highest-priority match wins, behaviour dispatch,
  no match means the `review` state (never a silent ignore), age cutoff from configuration.
- T5 [pending] S11: mail source abstraction with a fixture implementation, so sampling and
  classification can be exercised with no mailbox credentials.
- T6 [pending] S11: dry-run test module — top N plus a date range, per-message verdict (label, the
  rule that matched, behaviour, whether the LLM was consulted) and no side effects at all.
- T7 [pending] S9: LLM fallback — chooses among the user's labels and categories, runs only for
  bounded scenarios, and never becomes the path every message takes.
- T8 [pending] S1,S2,S7: preview a saved `.eml`, classify it, extract amount/date/merchant/currency,
  and create a `pending` draft. Nothing reaches `transactions`.
- T9 [pending] S8: unclassified queue plus the action that turns the email in front of the user into
  a rule.
- T10 [pending] S2,S5,S6,S7: `ImapEmailSource` (app password), a bounded resumable polling pass, and
  the `Gastos` label plus the general inbox as the two sources.
- T11 [pending] S2,S5,S10: drafts inbox in the web app to complete account, card, category and
  merchant, then confirm or discard.

## Log
L1. User request verbatim: «requiero cambios. por ahora tenemos stack de meter todo manual
    principalmente para revisar que tenga todos los datos. ahora requiero meter los gastos en
    automatico, por ahora vamos a leer correo y de ahi sacar gastos. principalmente solo algunas
    cuentas mandan correo y otras estan debajo de paypal asi que seria obtener correos relacionados
    crear gasto con los datos que puedan y dejarlo solo como draft para meter datos faltantes
    categoria negocio etc. Por donde empezamos?»
L2. User correction verbatim: «igual el correo tiene muchas cosas y requier clasificador pero no una
    mini app para eso podemos extender el leer el correo e ir clasificando los correos por completo ?»
L3. Measured facts at 2026-10-29. The Gmail API is billed at no additional cost (quota page: 6,000
    units/min/user, 1,200,000/min/project, 80,000,000/day threshold; overage billing is only planned).
    OAuth docs: a project whose consent screen is external and in Testing "is issued a refresh token
    expiring in 7 days". The Gmail scopes page lists `gmail.readonly` as restricted and says a
    security assessment is required when restricted data is stored on servers or transmitted. The
    app-password page still documents app passwords, gated on 2-Step Verification.
L4. Repo reality: no mail infrastructure exists (zero IMAP/SMTP/MailKit references). The reusable
    precedents are `telegram_expense_drafts` + `TelegramDraftService.ConfirmAsync` (nullable draft,
    `FOR UPDATE` confirm inside one DB transaction), `TelegramUpdateLedger` (claim, lease, attempts),
    the four `BackgroundService` passes, `catalog_rules` (normalized match, priority) and
    `GastosApp.AI` (`IExpenseIntentExtractor`, strict-JSON prompt, `LlmOptions.IsUsable`).
    `transactions` cannot hold a draft: `AccountId`, `Amount`, `BalanceImpact`, `Type`, `AmountMxn`
    and `TransactionDate` are all required, so drafts live in their own table.
L5. IMAP trap to respect: UIDs are scoped to `UIDVALIDITY`, so the idempotency key is the RFC822
    `Message-ID` and the UID is only a cursor hint.
L6. Email bodies are untrusted input. The classifier treats body text as data, never as instructions,
    following the rule already written in `ExpenseIntentExtractor`.
L7. Rule engine scope per S8. `email_rules` mirrors the existing `catalog_rules` shape (match type,
    match value, priority, active) because that pattern is already proven here; the new part is the
    field being matched (sender, sender domain or subject) and the route it assigns
    (`gastos`, `banco`, `ignore`). Match types: `equals`, `contains`, `starts_with`, `ends_with`.
    Regex stays out on purpose: a user-editable regex is an unbounded footgun. Highest-priority
    match wins; no match means `review`, not `ignore`, so nothing disappears silently. The two-year
    cutoff is configuration (`Email:DropOlderThanDays`, default 730), not a rule row, because it is
    policy, not a pattern. The classifier never calls the LLM; the LLM only extracts from messages
    already routed to `gastos` or `banco`.
L8. Read-only posture: no Gmail label is written back. The label/carpeta in S8 is ours, stored in
    `email_messages`, because writing labels would mean mutating the user's mailbox with an app
    password that otherwise only reads.
L9. The unclassified queue carries a one-click action that turns the email in front of the user into
    a rule. That is what keeps S8 "configurable" without building a second application.
L10. Reordered per S9: labels catalog first, then rules catalog, then the LLM fallback. No email code
    existed yet when the order changed, so only the task projection moved.
L11. S10 resolves the catch-all question without a code branch: a behaviour column on the label means
    "Otros" is data. The engine's default for no match stays the `review` state, which is a work
    queue, not a label — a queue empties when rules are created, a bucket just fills.
L12. Separation that the engine must keep: the email label is mailbox taxonomy, the expense category
    is financial taxonomy. A rule assigns a label; the draft's category comes from `catalog_rules`
    first and the LLM only as fallback, because `catalog_rules` already maps merchant text to a
    category and the LLM must choose from the user's real categories, never invent one.
L13. The S11 sampling module is a dry run and must stay one: it never inserts into `email_messages`
    nor creates drafts, otherwise every tuning pass would consume the `Message-ID` idempotency claims
    and the ledger would report already-processed mail that was never really processed. It reuses
    the engine in memory and returns the same verdict shape, so what the screen shows is produced by
    the code that will later run for real. Its default bound is small (N configurable, capped) and
    it also accepts uploaded `.eml` files, so tuning works before IMAP credentials exist.
L14. Because the dry run needs a message source before the mailbox is wired, `IEmailMessageSource`
    lands with a fixture implementation first and the IMAP implementation later. That is also what
    lets the engine tests run without credentials.
