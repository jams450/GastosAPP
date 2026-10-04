# Telegram conversational transactions

## Objective and authorization
Implement bounded, durable expense/income conversations for authorized Telegram user/chat pairs. Code, schema and an explicit upgrade SQL script are authorized. Never execute SQL, contact live DB/Telegram/LLM/remote/server, inspect secrets, commit, push or start review. Original dirty checkout is untouched. One writer in feature/telegram-conversational-transactions based on 80afa61471bedf75f664b95223510bf0b60cba6e.

## Route and delivery
Delegated preparation + multi-file writer. Parent owns orchestration, review and commits. Delivery strategy: feature-branch-chain (user selected). Stop and report if necessary edits exceed authorized surfaces or security semantics cannot safely be preserved. Forecast: 900–1400 authored lines (>400); parent decides delivery slicing. No commits.

## Tasks
- [x] Verify isolated branch and read repository instructions and required skills.
- [x] Attempt CodeGraph; missing isolated index, use targeted filesystem fallback without initialization.
- [x] Inspect authorization, extraction, drafts, update ledger, repository locks and schema.
- [x] Establish deterministic offline harness and observe RED (missing service CS0103 after local-cache restore).
- [x] Implement partial durable drafts, correction/confirmation, limits and isolation.
- [x] Preserve update/commit idempotency and transactional financial invariants in code; PostgreSQL integration proof pending.
- [x] Align EF/bootstrap/upgrade SQL; document rollout and rollback limitations.
- [x] Observe GREEN (38 checks), build solution (zero warnings/errors) and inspect final diff.

## Checks
Offline deterministic outcome tests: incomplete extraction; expense/income follow-ups; correction invalidates summary confirmation; cancellation and closure; user/chat isolation; message 20 confirmation versus over-limit; expiry; duplicate update/commit; commit failure preservation; malformed/oversized input/result. Run exact harness command and dotnet build code.sln. No live proof is claimed. Read back SQL/EF alignment.

## Memory mirror
Topic: odd/telegram-conversational-transactions/tasks. Full task mirror synchronization requested with capture_prompt=false. Discovery saved separately in project gastosapp.

## Evidence
- Skills loaded from all six requested absolute paths; repository AGENTS.md read.
- `dotnet restore GastosApp.Telegram.Tests/GastosApp.Telegram.Tests.csproj --source /home/jams45072/.nuget/packages`: PASS, no added packages.
- RED: `dotnet run --project GastosApp.Telegram.Tests/GastosApp.Telegram.Tests.csproj --no-restore`: CS0103 missing TelegramConversationService after correcting baseline record constructor. Initial no-restore attempt reported NETSDK1004 before cache restore.
- GREEN: same harness command: PASS 38 offline checks, fake persistence; no PostgreSQL proof.
- `dotnet build code.sln`: PASS, zero warnings and errors.
- `git diff --check`: PASS.
- Forecast 900–1400 authored lines; actual 606 additions at first final census, plus final task evidence lines (approximately 616). Exceeds 400: parent owns delivery decision, no commits.

## Remaining risk and next step
Parent review required. Validate PostgreSQL row-lock/lease fencing/savepoint rollback and duplicate update behavior in an authorized isolated database before rollout. SDK response bound is checked after SDK allocation/deserialization. Identity lock spans LLM call and serializes all chats for that identity. Real model ambiguity detection relies on explicit newMovement/unknown extraction; no deterministic natural-language semantic oracle is claimed. Reply delivery is best effort after durable update completion. Manual commands preserve legacy date behavior. Upgrade SQL was not executed; inspect constraint names/data compatibility before applying. Parent owns feature-branch-chain delivery slicing and review; do not run review START, commit or push from this subagent.

## Bounded confirmation regression fix
Independent verification found `/confirmar cambia el monto a 200` could save the old summary because the parser ignores trailing command text. Router now rejects non-standalone confirmation and asks for standalone confirmation or a separate correction. Production router/parser/transaction path exercised with fake persistence, no model/database access. Plain `/confirmar` and standalone `sí` remain valid.
- RED: `dotnet run --project GastosApp.Telegram.Tests/GastosApp.Telegram.Tests.csproj --no-restore` failed `Mixed confirmation/correction must not save old amount` (exit 134).
- GREEN: same command PASS 43 offline checks.
- `dotnet build code.sln`: PASS zero warnings/errors.
- Correction edit scope: router, harness and this task document only.
- Final delivery size counts authored additions PLUS deletions, including new files; see parent return for exact census. Earlier 615 counted additions only, not total churn.
