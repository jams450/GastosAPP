# Server credit reconciliation and UI follow-up
Objective: reconcile production credit read-only first; then address explicitly requested UI follow-up.
Branch: work/server-credit-reconciliation-ux. Delivery: separate reversible work-unit commits; no push/deploy. Checks: Python fixtures, PostgreSQL read-only verification, existing .NET/frontend checks when available.

## Specs
S1. «Objetivo inmediato: conciliar de forma verificable los saldos de todas las cuentas de crédito. No continuar todavía con la implementación general de proyecciones ni inversiones.»
S2. «Está autorizada únicamente la lectura de datos para la conciliación.» «Antes de consultar, confirma qué entorno y base corresponden a este servidor.» «No ejecutes actualizaciones, migraciones, recálculos de saldo ni operaciones que creen sesiones.» «No imprimas secretos ni cadenas de conexión.» «No inviertas signos, elimines saldos iniciales ni crees ingresos, gastos o pagos ficticios.»
S3. «Prepara una consulta reproducible y valida sus agregaciones con pruebas deterministas.» «Obtén una única lectura consistente con REPEATABLE READ READ ONLY, timeout y rollback.» «Por tarjeta compara: línea, saldo inicial, saldo actual, suma de impactos de movimientos, residual contable, deuda normal, deuda MSI y disponible.» «Evita duplicaciones por joins y comprueba automáticamente sumas y totales.»
S4. «Explica las diferencias comprobadas y presenta cualquier ajuste con valor actual, valor propuesto y motivo.» «Espera mi autorización explícita antes de modificar datos.» «No repitas auditorías indefinidamente: si falta evidencia o falla una comprobación, informa el bloqueo concreto. Conserva cualquier cambio ajeno y actualiza el plan con evidencia verificable.»
S5. «adicional requiero que revisar al guardar gato ingreso transferencia sin subcategoria no deja»
S6. «Revisar dashboard formulas que se acaban de crear del commit y revisar diseno visual con base a las nuevas formulas en front, considera que se puede colocar graficas y colores adicionales»
S7. «Dentro de gastos, ingresos y transferencias que lo adicional este abierto y que no tenga que darle click siempre, mejor UI UX»
S8. «Dentro de catalogos de cuentas mejorar ui ux para el hissstorial y tabla -> formulario que acepte punto decimal en varios»
S9. «En varios formularios si das click afuera del form se cierra evitar eso en toda la app»

S10. «Revisar en dashboard o en otra seccion tabla de pendiente por pagar pero por responsable entre normal y msi de credito puede ser en dashboard credito»
S11. «Mejorar sugerencias en budgets porque salen muchas coincidencia debil solo por el mismo dia cuando justo cuando tengo 1 con el mismo monto banco etc y solo revisa el dia»

S12. «no crear muchas unit test sin valor, puedes instalar los componentes faltantes o librerias nuevas»

## Tasks
- T1 [done] S1-S4: read-only reconciliation, deterministic checks and report completed; route inline after delegated map and independent verification; commit 68c9dc5. Cause/adjustment requires historical evidence; no data edits.
- T2 [blocked] S5: delegated mapping and six public BFF probes accept missing/null subcategory; needs exact user error and screen context to reproduce the actual rejection. No speculative fix.
- T3 [blocked] S6: static formula/design review documented in 6b05180, docs/REVISION_DASHBOARD_SERVIDOR.md. Authenticated visual check needs existing session; no login/session creation allowed. No projection/investment implementation.
- T4 [done] S7: always-open transaction fields implemented; independent structural verification approved, TypeScript and 314 tests pass; commit b26fbcf. Browser rendering/interactions not exercised; limitation recorded, not claimed as proof.
- T5 [done] S8: decimal draft capture 2796159 and history/table navigation 1f33a64. Writer checks and parent TypeScript/315 tests pass; six focused conversion checks pass. Assessment medium, reviewDue=false, no additional verifier required. No real browser or meaningful runtime RED for presentation; no fabricated DOM proof.
- T6 [done] S9: 12 backdrop handlers removed, explicit controls and existing Escape preserved; independent structural verification approved without blockers, TypeScript and 314 tests pass; commit ba8fd2d. Browser interaction not exercised.

- T7 [blocked] S10: mapping completed; no party dimension on payments. Needs human attribution rule for payments and missing expense shares before implementation; no proportional rule assumed.
- T8 [done] S11: missing candidate account/merchant fixed; suggestion-specific selector includes Strong/Weak and emits actual strength; frontend prioritizes strong with label/color. RED/GREEN observed; parent and independent checks pass (58 projection + 8 matching + 5 selection, build clean, TypeScript and 315 frontend tests). Independent verification without blockers; commit 4bcb009. No live endpoint/DB/browser checks.

- T9 [done] S12: baseline lock repaired, existing metadata preserved, install and dry-run pass; commit b48de66. Frontend 314 tests and TypeScript pass.

## Log
L12. User authorized local identity «Andres Mitzi jams45072@gmail.com» and requested «has commit cortos para tus cambios y tener el historial, no puedes hacer push». Repository-local identity set; four commits created: 68c9dc5, b48de66, b26fbcf, ba8fd2d. No push executed.
L13. Single production snapshot completed, rollback verified, five accounts and 365 movements. Total debt 26,824.69; only BBVA accounting residual 63,488.49, plus Paid installment residual 1,378.45. Cause not established. Full report docs/CONCILIACION_CREDITO_SERVIDOR.md; no automatic repeat or data correction.
L14. Public BFF validators accept missing/null subcategory for expense/income/transfer (six probes). Actual UI rejection not reproduced; need exact message/context rather than invent a fix. Responsible-party table awaits payment attribution rule; no proportional distribution assumed.
L15. Independent static dashboard review found active-only debt filtering, hidden overpayments, absent overdue/cutoff split, three-month sample requirement and unconfirmed pending variance. These are code gaps, not runtime proof; projection implementation remains out of scope. Credit charts can use existing palette/recharts after formulas are agreed.
L17. Accounts UI completed in 1f33a64 with explicit history links, saldo contable labels and annual section navigation. Parent final TypeScript and 315 tests pass. Native assessment of 4bcb009..1f33a64: medium, reviewDue=false, independentVerifier=false. No native review approval claimed. Remaining blockers: exact subcategory failure message/context, existing authenticated session for visual dashboard review, and responsible-party payment attribution rule. No data adjustments authorized, no push.
L16. Budget suggestions completed and independently approved in 4bcb009. Initial implementation was corrected because SelectWeak excluded newly recognized strong candidates. Strong/weak selection and frontend order now agree; querying never links records. Decimal subunit committed as 2796159, numeric payload and integer days preserved; real browser absent. Parent does not accept missing-file compile failure as meaningful RED evidence. History/table writer mvaif8fz-e-4z4w still running. No push.
L1. Original reconciliation request: «Necesito que ejecutes el plan puedes leer .env para conectar de lectura a la db igual ya hice bk hoy
Continúa el trabajo del dashboard desde el commit 9bf5881, que ya está publicado en el remoto.» Requirements above preserve its acceptance rules; full operational baseline is docs/PLAN_REANUDACION_DASHBOARD.md and docs/FORMULAS_DASHBOARD.md, historical odd/tasks/dashboard-budget-investment-projection.md is not definitive.
L2. Destination explicitly confirmed by user: «si pro, pero da igual tu puedes leer». Production credentials remain private. No database connection attempted yet. Docker runtime inspection denied socket permission; no workaround attempted.
L3. Baseline 9bf588192bbc328e798bc39e11755c0d6db8e321; clean initial working tree; feature branch created. No migrations, login, deployment, or data mutations authorized.
L4. Schema exploration found active-only dashboard filtering excludes inactive debt, and opening_credit contributes debt without balance impact. Parent spot-check confirmed active filter and impact fallback. Persisted balance impacts and legacy reconstructed impacts must remain separately labeled.
L5. SQL/audits/credit_reconciliation.sql prepared; Python SQLite fixtures passed 4 tests (scope, fanout prevention, Posted payments/statuses, transfer pairing, null limits, excess and totals). SQLite does not prove PostgreSQL compatibility. No meaningful RED for a new read-only audit artifact; deterministic fixtures run before real data.
L6. Environment: .NET SDK 9.0.121 available; psql, psycopg, libpq, pg, pnpm, pip, restored Npgsql assets unavailable. Need repository-local reader dependencies before production snapshot. No dependency installation attempted yet.
L7. Additional user request verbatim: «Te paso todos los puntos adicionales:
1. Revisar dashboard formulas que se acaban de crear del commit y revisar diseno visual con base a las nuevas formulas en front, considera que se puede colocar graficas y colores adicionales
2. Dentro de gastos, ingresos y transferencias que lo adicional este abierto y que no tenga que darle click siempre, mejor UI UX
3. Dentro de catalogos de cuentas mejorar ui ux para el hissstorial y tabla -> formulario que acepte punto decimal en varios
4. En varios formularios si das click afuera del form se cierra evitar eso en toda la app»
L8. UI scope is larger than a diff-only handoff; this document tracks it before UI source changes. Initial forecast unknown until bounded map; commits remain distinct, no PR/delivery strategy selection needed before a concrete review slice exists.
L9. Additional user request verbatim: «5. Revisar en dashboard o en otra seccion tabla de pendiente por pagar pero por responsable entre normal y msi de credito puede ser en dashboard credito
6. Mejorar sugerencias en budgets porque salen muchas coincidencia debil solo por el mismo dia cuando justo cuando tengo 1 con el mismo monto banco etc y solo revisa el dia». Credit reconciliation remains the immediate priority; these do not authorize production writes or general projection implementation.
L11. User instruction verbatim: «no crear muchas unit test sin valor, puedes instalar los componentes faltantes o librerias nuevas». Prefer focused behavioral regression and aggregation checks over redundant unit tests. Dependency installation is authorized when necessary; no production deployment, service restart, database mutation or session creation is implied.
L10. Existing dashboard test project restore completed successfully. A new repository-local .NET reader is prepared but not yet compiled or independently verified. No production connection attempted. The SDK printed first-run development certificate setup; no API/login was executed.
