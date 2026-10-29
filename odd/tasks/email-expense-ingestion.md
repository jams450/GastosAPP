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
- T1 [done] S1,S3,S4,S9,S10: schema — `email_labels` (user, name, kind folder/label, behavior,
  colour, system flag, sort order), `email_rules` (match field sender/sender_domain/subject, match
  type, value, target label, priority, active), `email_messages` (one row per RFC822 `Message-ID`,
  mailbox, UID, received date, label, state, matched rule, failure), `email_expense_drafts`
  (nullable draft fields, raw text, card hint, status, TTL, `transaction_id`). Dated migration plus
  `SQL/schema.sql` and the manifest. Committed bbd9d94; migration ships unapplied, build 0 warnings
  and `dotnet test code.sln` 115 passed.
- T2 [pending] S9,S10: labels catalog — API done: `EmailLabelService` (slug normalization, behaviour
  validation, idempotent system seeds), `EmailLabelsController` (list, get, create, update, active
  toggle, `POST api/emaillabels/defaults`) and its DTOs. Committed ede94eb. The catalogs UI
  section remains.
- T3 [pending] S9: rules catalog — API done: `EmailRuleService` (three match fields, four match types,
  normalized `match_value`, target-label ownership check), `EmailRulesController` mirroring
  `CatalogRulesController` and its DTOs. Committed ede94eb. The UI remains.
- T4 [done] S3,S8,S10: deterministic engine — `EmailRuleEvaluator` is a pure function (priority, id
  tiebreak, the four comparators, skips inactive rules and inactive target labels) and
  `EmailClassificationService` loads the user's rules, applies `Email:DropOlderThanDays` and
  dispatches by behaviour; no match is the `review` outcome. Committed ede94eb; verified with
  `dotnet build code.sln` (0 warnings, 0 errors) and `dotnet test code.sln` (131 passed), of which
  11 tests pin exactly those behaviours.
- T5 [done] S11: fixture input — `EmailHeaderParser` reads only the headers of a saved `.eml`
  (folding, RFC 2047 words, RFC 5322 dates) so classification is exercised with no credentials.
  Rescoped from L14, which is superseded: see L15 and L16. Committed 0ea04d3.
- T6 [done] S11: dry-run test module — `POST api/emailclassification/preview` takes raw `.eml` text
  and/or hand-written candidates, applies the date range, caps the sample (default 50, max 200) and
  returns the per-message verdict plus the state a real pass would write. It writes nothing by
  construction. Verified by build and the 131-test suite; the HTTP path itself was not exercised
  because there is no database access in this environment. Committed 0ea04d3.
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
L15. Correction to L14, decided while implementing T5: no `IEmailMessageSource` abstraction is built
    yet. A single source does not need an interface — it would be an unused abstraction whose only
    caller is the thing that created it, and the dry run does not need to read a directory: the
    preview endpoint takes the `.eml` text or a hand-written candidate directly. The abstraction
    earns its place when the IMAP source (T10) arrives as the second implementation. What was built
    is the part that has to be right either way: the header reader.
L16. Two measured traps in `EmailHeaderParser`, each one silently wrong before it was pinned by a
    test. First, RFC 2047 §6.2: the whitespace between two adjacent encoded words must be dropped,
    otherwise a bank subject folded into two words decodes with a double space and the subject rule
    that should match does not. Second, RFC 5322 writes the offset as `-0600` and
    `DateTimeOffset.TryParse` with the invariant culture rejects that form, so every real date came
    back empty and the age cutoff never applied; the parser normalizes it to `-06:00`. The same read
    also found that a non-English or incorrect weekday makes .NET reject the whole date, so parsing
    retries without the day prefix rather than losing the timestamp.
L17. Layering decided while wiring the classifier: `GastosApp.AI` references no project and
    `GastosApp.BusinessLogic` does not reference `GastosApp.AI`, so the deterministic engine lives in
    BusinessLogic without any model dependency and the LLM fallback (T7) is orchestrated in the API
    layer, exactly as the Telegram services already do. The deterministic path therefore cannot
    accidentally call a model.
L18. Work units landed at 2026-10-29. `ede94eb` holds the engine and the label and rule catalogs API
    (20 files, +1394); `0ea04d3` holds the header reader and the dry-run preview (10 files, +673).
    Both were checked with `dotnet build code.sln` (0 warnings, 0 errors) and `dotnet test code.sln`
    (131 passed, 0 failed). Not verified and not claimed: the migrations are still unapplied, the
    HTTP endpoints were never exercised against a database, and none of the UI exists, so no browser
    check was possible.
