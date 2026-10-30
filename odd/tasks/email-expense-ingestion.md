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

S12. User confirmed «si aplicar»: apply existing Gmail labels to the SAME reviewed IMAP sample.
    Add-only: never create labels, move, delete, or expunge. Manual eml stays dry-run.

S13. Daily automatic label application: user «agrega el job sera ejecutado diario no necesito a cada rato, en donde busque correos sin etiqueta nada mas e utilice las que tenemos». Choices: ANY user label excludes, INBOX only. Existing manual preview remains target-label-only.
S14. NOT uses negated on conditions and groups, default false, retaining AND/OR and current comparisons; no not_contains operator proliferation.

S15. Terminal rule actions: assign_label (default), review, llm. Reuse Telegram Llm provider/model/config, not bot transport. First matching action stops evaluation; disabled/failing/invalid LLM ends in review. User explicitly permits ALL active labels, including ignore/Eliminar, as valid LLM choices; never delete mail.

## Tasks
- T1 [done] S1,S3,S4,S9,S10: schema — `email_labels` (user, name, kind folder/label, behavior,
  colour, system flag, sort order), `email_rules` (match field sender/sender_domain/subject, match
  type, value, target label, priority, active), `email_messages` (one row per RFC822 `Message-ID`,
  mailbox, UID, received date, label, state, matched rule, failure), `email_expense_drafts`
  (nullable draft fields, raw text, card hint, status, TTL, `transaction_id`). Dated migration plus
  `SQL/schema.sql` and the manifest. Committed bbd9d94; migration ships unapplied, build 0 warnings
  and `dotnet test code.sln` 115 passed.
- T2 [done] S9,S10: labels catalog — API done: `EmailLabelService` (slug normalization, behaviour
  validation, idempotent system seeds), `EmailLabelsController` (list, get, create, update, active
  toggle, `POST api/emaillabels/defaults`) and its DTOs were committed in ede94eb, and the screen
  at `/mail/labels` landed in 75bcfb1.
- T3 [done] S9: rules catalog — API done: `EmailRuleService` (three match fields, four match types,
  normalized `match_value`, target-label ownership check), `EmailRulesController` mirroring
  `CatalogRulesController` and its DTOs were committed in ede94eb, and the screen at `/mail/rules`
  landed in 75bcfb1, with the target label chosen from the user's real labels.
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
  because there is no database access in this environment. Committed 0ea04d3; the screen that uses it
  is `/mail/test`, landed in 75bcfb1.
- T7 [pending] S9: LLM fallback — chooses among the user's labels and categories, runs only for
  bounded scenarios, and never becomes the path every message takes.
- T8 [pending] S1,S2,S7: preview a saved `.eml`, classify it, extract amount/date/merchant/currency,
  and create a `pending` draft. Nothing reaches `transactions`.
- T9 [pending] S8: unclassified queue plus the action that turns the email in front of the user into
  a rule.
- T10 [done] S6,S7: IMAP **conexión y configuración únicamente**, como pidió el usuario: «sin job por
  ahora solo conexion y config». `ImapOptions` (`Email:Imap`, `IsUsable` rechaza placeholders `SET_`
  para no arrancar con secretos falsos), cliente MailKit de solo lectura que abre el buzón con
  `FolderAccess.ReadOnly` y pide `Envelope` + `InternalDate` en vez del cuerpo, así que leer la
  muestra no marca ningún mensaje como leído. Lista las etiquetas de Gmail como buzones y el módulo
  de prueba puede muestrear uno. Verificado con `dotnet build code.sln --no-incremental` (0 errores)
  y `pnpm build` + `pnpm test` (370 pasaron); **la conexión real nunca se abrió en este entorno**
  porque no hay credenciales, y `.env.example` no se pudo escribir (ruta bloqueada por el entorno).
- T12 [pending] S2,S4,S6: pase de sondeo acotado y reanudable sobre la conexión de T10 — separado de
  T10 a propósito, porque el usuario pidió primero la conexión y el sondeo en segundo término. Lee
  la etiqueta `Gastos` y el inbox general, y ahí sí aparece el corte de antigüedad actuando sobre
  correo real.
- T11 [pending] S2,S5,S10: drafts inbox in the web app to complete account, card, category and
  merchant, then confirm or discard.

- T13 [blocked] S12: reviewed-sample apply. Parallel delegated backend/frontend units with
  disjoint surfaces. Preserve UID/UIDVALIDITY and message identity; opaque random token stored
  server-side for 15 minutes, bound to user and configured account, consumed once per apply.
  Return per-row outcomes; reject expired/changed mailbox identity. No DB or live IMAP access
  from the agent. Native review remains blocked by outdated managed assets.

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
L19. Correo UI round, and a correction to L18: the UI does exist now. Three screens landed under
    `/mail/*` in 75bcfb1 — labels, rules and the dry-run sampler — and the sidebar was split into
    «Gastos» and «Correo» so the two domains are distinguishable in the menu the user asked about.
    The screens reuse `catalogs/_shared` through relative imports instead of a new extraction: a
    refactor of the existing catalog screens would have touched seven files the request did not
    mention. The extraction condition is a third feature needing those components.
    A contract detail is pinned by a test because it fails silently: `match_type` persists `equals`
    while the backend constant is named `Exact`, so a UI sending `exact` would save a rule that
    never matches. Verified by `pnpm build` (exit 0, three routes registered), `pnpm run lint`
    (0 errors, 9 pre-existing warnings) and `pnpm test` (369 passed). Still not verified: no browser
    run, and no verdict observed end to end because the database is unreachable here.
L20. Validación del usuario el 2026-10-29, verbatim: «funciona ui de reglas y etiquetas. probe ambas en
    modulo de prueba con eml reales». Corrige lo que L18 y L19 declaraban no verificado: las
    pantallas de etiquetas y de reglas se usaron en un navegador por una persona, y el módulo de
    prueba clasificó mensajes `.eml` reales, así que el lector de cabeceras corrió contra correo de
    verdad y no solo contra las cadenas construidas en las pruebas.
    Implicación a confirmar, inferida y no comprobada por mí: que esas pantallas respondieran implica
    que `2026-10-29_email_classification_schema.sql` está aplicada, porque sin las tablas la API
    habría devuelto error. Lo que sigue sin verificar es la corrección de los veredictos: "funciona"
    cubre el flujo, no que cada clasificación sea la esperada, y ahí es donde queda el ajuste de
    reglas con el correo real del usuario.
L22. IMAP, solo conexión y configuración, por instrucción explícita del usuario: «yo voy sacando el 1,
    tu el 2 de imap sin job por ahora solo conexion y config. y que en test se puede probar». Se
    agregó MailKit 4.18.2 a `GastosApp.API` (la integración vive en la capa API, como Telegram, porque
    `GastosApp.BusinessLogic` no referencia nada externo). Tres decisiones sostienen la lectura sin
    efectos: `FolderAccess.ReadOnly`, pedir `Envelope` + `InternalDate` en vez de `BODY[]` —que es lo
    que marcaría el mensaje como leído en el buzón del usuario— y no exponer ningún STORE, APPEND ni
    MOVE. El listado de buzones responde siempre 200 con un motivo legible cuando no hay
    configuración, porque un 500 ahí parece un defecto del programa y en realidad es una instalación
    incompleta. En el preview, el fallo de IMAP se convierte en 400 solo cuando la petición pidió un
    buzón: el camino con archivos `.eml` sigue sin tragarse errores.
L23. Lo que este round **no** verifica: ninguna conexión real se abrió, así que la autenticación con
    contraseña de aplicación, los nombres exactos de los buzones de Gmail y el comportamiento de
    `GetFolders`/`FetchAsync` en MailKit quedan pendientes de que el usuario los ejercite desde
    `/mail/test`. El código compila y las pruebas pasan; eso no es lo mismo que haber hablado con el
    servidor. `.env.example` no se pudo editar (el entorno bloquea esa ruta), así que las claves
    `Email__Imap__*` quedan documentadas en `ImapOptions` y en la respuesta al usuario.
L21. Cierre del color de etiqueta (7083579): el campo era texto libre y el valor no se pintaba en
    ninguna parte, así que prometía algo que la pantalla no entregaba. Ahora es selector nativo, hay
    muestra en la lista y el contrato solo acepta `#rrggbb`, que es lo único que el input nativo
    entiende. El campo «Orden» quedó documentado en la propia pantalla porque hace menos de lo que
    parece: solo ordena la lista y el desplegable de etiqueta destino, nunca la clasificación.

L24. Route for S12: parallel bounded writers (backend vs frontend) because these are independent
implementation units with a shared contract. Preview response adds applyToken (nullable),
applyExpiresAt (nullable ISO timestamp), applicableCount (number). POST apply accepts only
{token}; response {rows:[{name,label,status,message}], applied, skipped, failed}. UI confirms
applying all eligible rows from that exact sample; token is not permission to run a fresh search.

L25. S12 implementation and offline verification completed: backend writer and independent verifier
observed 33 focused / 175 suite tests, build 0 warnings/errors; frontend final parent checks observed
12 focused / 376 suite tests, typecheck, lint (0 errors, 9 pre-existing warnings), and production build
exit 0. Independent correction readback PASS for per-status count consistency and stale/expiry
handler guards. No browser or live IMAP/DB call was performed. Native review/commit closure remains
blocked by the previously reported outdated managed assets; no sync, commit, push or deployment.
Use a small reviewed sample and a pre-existing Gmail user label whose full name exactly matches
its catalog Name. Tokens expire after 15 minutes, are single-use, and disappear on API restart;
this in-memory implementation requires one API instance. Never promise an atomic no-create
invariant if the user deletes a label between enumeration and Gmail STORE; do not rename/delete
labels during apply. No draft or transaction is created by applying a label.

L26. Nested-rule persistence fix: every group is now bound by navigation to its owning rule on
create and update, preserving parent links. Writer observed two failing deep-tree tests before
fix; independent verifier passed five EF-tracking tests, backend suite180 and build0/0.
No SQL executed: PostgreSQL acceptance still requires the user's live save check.
L27. User requested «tambien en el test si tiene etiqueta que lo ignore y no lo muestre» and chose
«Con la etiqueta destino de su regla», not any user label. IMAP snapshots Gmail labels only when
GMailExt1 is advertised; exact ordinal catalog destination Name match hides the row before both
Rows and the apply plan. Other labels and manual messages remain visible. Hidden messages consume
the scanned sample cap (no refill), are counted as SkippedAlreadyLabelled / «Ya etiquetados», and
never enter the token. Independent PASS:38 focused backend/185 suite,13 focused frontend/377 suite,
backend+frontend builds/typecheck/lint exit0 (9 pre-existing lint warnings). No live Gmail, DB or
browser verification; native review/commit closure remains blocked as recorded in L25.

L28. Daily job scope supersedes T12's old multi-mailbox poller proposal for classification only:
INBOX, bounded pass, automatic additive application of existing labels using the configured user's
rules. Configuration Email:Ingest Enabled=false, UserId required positive, HourUtc configurable;
wait until next daily slot (no startup execution/retries). No implicit user 1 or Telegram identity.
Unmatched mail stays untouched. Cursor can rotate in process to avoid newest-N starvation; restart
may rescan safely. Recheck absence of any user label before STORE, not merely target absence.
Keep deployment single-instance as for the existing apply token store. No live mailbox access by agent.

L29. S15 implementation decision: action belongs to rule, not label behavior. Make TargetLabelId
nullable and require it only for assign_label; review/llm carry no fake destination label. Use
terminal llm_requested reason from deterministic service, API orchestration only for actual model.
Review has no IMAP label/plan; accepted LLM choice is terminal and may apply its active existing
label, including ignore (explicit user choice). Max20 calls/run default, cap50 active catalog labels;
if catalog exceeds cap, fail to review rather than silently omitting a user's valid choices.
NOT stays per condition/group negated=false by default. Ship manual migration, never apply here.

L30. Independent component reviews completed: daily job PASS (13 focused, suite221 including AI,
build0/0), reusable AI classifier PASS (23 focused, strict JSON/catalog bounds, no live call),
NOT and terminal-rule model/API/editor PASS (44 focused backend,17 frontend,typecheck and both
normal/no-incremental backend builds0/0). The two nullable warnings were fixed with explicit
Assert.NotNull assertions in legacy evaluator tests. Migration
2026-10-30_email_rule_actions_and_negation.sql remains UNAPPLIED. These approvals do not cover
actual LLM orchestration: API preview/job integration and run budgets are still being implemented.

L31. Final S15 API integration independently PASS: backend build0/0,21 integration/44 total LLM
focused/259 suite tests; frontend17 focused/381 suite,typecheck/build exit0 (lint writer0errors,
9 pre-existing warnings). Explicit llm action works with no-match fallback off. Shared run budget
(default20,clamp0..200) is constructed once by preview and daily runner. Review never produces an
IMAP plan; model choice may select any active label including ignore, as authorized. No persistent
review queue exists. Real DI resolution/browser/provider/Gmail/Postgres remain unverified; DI was
inspected statically and all runtime model/client tests used doubles. New migration remains unapplied.
Configuration to be supplied by operator (do not edit secrets/example here):
Email__Ingest__Enabled=false, Email__Ingest__UserId=<explicit app user id>,
Email__Ingest__HourUtc=12, Email__Ingest__MaxMessages=50,
Email__LlmFallbackEnabled=false, Email__LlmMaxPerRun=20.
Existing Llm__BaseUrl/ApiKey/Model shared with Telegram, not Telegram bot credentials.
Native review/commit closure remains blocked by outdated managed assets as previously recorded.

L32. User «Lo del llm amplialo a mas de 50» clarified via choice «Más etiquetas: hasta 200».
Supersedes the 50-label ceiling in L29/L31: shared MaxLabels now200, no truncation;201failsclosed.
Call budget20/run and daily batch50 remain unchanged. Observed RED51/200 rejected then47focused
LLM tests green, fullsuite262 and build0/0. First suite found manifest ordering wrong after two
personal migrations were added concurrently; only those manifest entries were reordered, no SQL
content changed or applied. Independent narrow verification pending. Larger catalogs increase
prompt cost/context usage; no real provider call was made.

L33. User requested «commits y merge a main» and explicitly chose «Dejar esta candidata sin
revisión nativa» after the managed-assets stop. No global switch changed, no native approval
claimed. Delivery commits: d7c1b9b (AI classifier200),3491ea9 (NOT/terminal rule model/FK/migration),
c32cc0e (IMAP apply/daily job/LLM orchestration),fc65f6d (rules editor and reviewed apply UI).
Personal SQL proposals/migrations and their manifest entries, .env.example, .atl files and tracked
build artifact remain outside these commits. Local merge only; no push or deployment authorized.
The accumulated shared surfaces produced large commits; they are not claimed to be small review
slices. Independent tests remain262 backend and381 frontend, builds clean; no live-system proof.
