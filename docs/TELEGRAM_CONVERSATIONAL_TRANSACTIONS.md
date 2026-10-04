# Telegram conversational expense and income capture

## Contract

Authorized private Telegram identity/chat pairs can start an expense or income with free text. Existing commands remain available. Required conversational facts are amount, account, category, date and description. Missing facts are requested one at a time; date is not silently inferred when absent. Existing explicit manual commands retain their previous server-date behavior.

A conversation stores only bounded structured state, not a transcript. Follow-up messages merge explicit fields into that state. Account/category/date/description/amount corrections generate a fresh complete summary before confirmation is accepted. Intent switches, unknown/ambiguous extraction and model-marked new movements do not replace the active transaction. Start another movement with `/cancelar` first. `/pendiente` inspects current state; `/confirmar` or the existing affirmative shortcuts confirm it. Successful saves and cancellations close the context. Save failures leave it pending and never return success.

## Bounds and expiry

- Current input: at most 2000 characters before extraction.
- Structured JSON: at most 4096 serialized characters; catalog names at most 150; description at most 500.
- Extracted model response: at most 8192 characters after the SDK response; malformed JSON follows the existing safe extractor error path.
- At most 20 accepted user turns, including initial capture, commands, corrections and confirmation. Confirmation at count 19 increments to 20 and can save. A following turn expires the draft without creating a transaction.
- Existing 15-minute draft TTL is retained. Corrections do not renew it.
- Model input consists of system instructions, bounded current draft, bounded current message and current owner catalogs. No prior transaction history is supplied.

The SDK still allocates/deserializes its response before the response-size check; this is a validation bound, not a transport byte cap. Unusable LLM configuration preserves command access but cannot continue free-text extraction.

## Consistency and security

Existing authorization entry points remain unchanged. All pending reads/cancellation/replacement are scoped by Telegram identity and chat. Catalog resolution and financial writes reuse the existing transaction services, including blocked credit-account income and ownership/balance validation.

Router operations hold the identity row lock, including first-message draft creation. This serializes all chats for one identity (conservative contention tradeoff). Complete correction replaces the internal draft row while preserving state, count and original expiry. Pending uniqueness is `(telegram_identity_id, chat_id)` with `status = 'pending'`.

Update processing locks the processed-update row and verifies the current claim token before routing. Draft changes/financial mutation and marking the update done share one database transaction. A retry or stale reclaimed worker cannot repeat committed effects. Sending the bot reply occurs afterward: database success is durable even if delivery fails. Reply delivery is best effort, not exactly once. No reply outbox is introduced.

Confirmation keeps the existing draft `FOR UPDATE` lock. A dedicated savepoint protects financial mutations when confirmation validation fails inside the outer update transaction; rollback clears tracked failed transaction/balance changes while preserving the counted turn and pending draft. Distinct confirmations after closure find no pending draft.

PostgreSQL lock, savepoint, concurrent lease and rollback semantics require isolated database integration validation before rollout. Offline harness uses fake persistence; it does not prove database concurrency.

## Rollout (operator action only)

1. Back up the database and verify a restoration plan. Stop all Telegram workers before deployment.
2. Verify current schema contains the existing expense/income draft and durable ledger tables, the `telegram_expense_drafts_amount_check` constraint and `uq_telegram_expense_drafts_pending_chat` index. Check historical confirmed rows have amount/date/account/category.
3. Review and manually apply `SQL/telegram_conversation_state.sql` during a maintenance window. Script is transactional and intentionally fails on rerun or schema drift. It takes an exclusive table lock; do not apply while workers run.
4. Deploy matching code; restart workers only after schema verification.
5. Validate isolated conversations, concurrent duplicate updates, failure rollback, expiry, authorization and count boundaries. Do not test financial writes against production without separate authorization.

`SQL/schema.sql`, EF mapping and upgrade script declare matching nullable amount/date, bounded state/count and identity/chat pending uniqueness. No SQL was executed during development.

## Revert limitations

Stop workers before reverting. Old code cannot safely interpret partial drafts or multiple identity-scoped pending rows sharing a chat. Archive or resolve partial rows, expire pending conversations and reconcile pending chat duplicates before restoring the old unique index and NOT NULL constraints. Do not invent financial values to satisfy old constraints. Confirmed financial transactions require domain reversal, not deletion of conversation state. Prefer restoring a validated backup or a separately reviewed forward fix; this upgrade intentionally does not ship an automatic destructive down script.

## Offline verification

```sh
dotnet restore GastosApp.Telegram.Tests/GastosApp.Telegram.Tests.csproj --source /home/jams45072/.nuget/packages
dotnet run --project GastosApp.Telegram.Tests/GastosApp.Telegram.Tests.csproj --no-restore
dotnet build code.sln
```

Harness covers partial income/expense extraction, two-turn completion, corrections and summary, cancel/close/reset, identity/chat isolation, confirmation duplication, commit failure preservation, count 20/21, expiry, malformed/oversized structured state and model fields. PostgreSQL concurrency and real model behavior remain pending. No live DB, Telegram or LLM calls are part of these checks.
