# Consultas financieras de Telegram — finanzas, pagos, presupuestos y alertas

Consultas de solo lectura. Reutilizan `IDashboardService.GetOverviewAsync` con
identidad persistida del usuario y zona `America/Mexico_City`. El LLM no puede
seleccionar otro `userId`: las funciones registradas cierran sobre esa identidad.
No cambian borradores, confirmaciones ni registro de movimientos.

## Herramientas

| Función | Resultado |
|---|---|
| `saldos_efectivo` | Saldo actual por cuenta y total de cuentas `IsCredit=false`, incluidos bancos y débito. |
| `credito_disponible` | Disponible actual por cuenta de crédito (`IsCredit=true`) y suma de valores conocidos. |
| `resumen_financiero` | Ingresos, gastos y neto financiero mensual del dashboard, con `scope=all`, `cash` o `credit`. |
| `pago_tarjetas` | Pago estimado, pagos realizados y pendiente del corte por tarjeta y agregados. |
| `presupuestos` | Estado de presupuestos configurados, incluidos inactivos, sin evaluar ni enviar alertas. |
| `alertas_presupuesto` | Historial de entregas de umbrales de presupuesto del mes, no todos los avisos de partidas. |

Las primeras cinco reciben `request` con `Mes` opcional (`yyyy-MM`) y `Scope` opcional.
`alertas_presupuesto` recibe únicamente `Mes` opcional, sin filtro de estado.
`Mes=null` u omitido usa el mes actual en México, mediante `MonthRangeResolver`.
Un mes explícito inválido, vacío o con espacios se rechaza antes de consultar.
`Scope` omitido significa `all`; los únicos valores explícitos válidos son
`all`, `cash` y `credit`, en minúsculas sin espacios. El scope selecciona el
resumen financiero; saldos, pagos y presupuestos tienen su selección fija.

## Semántica y límites

- Efectivo usa `CurrentBalance`, no `ClosingBalance`: es saldo actual, incluso
  cuando se solicita otro mes; no debe presentarse como saldo histórico.
- Disponible usa exactamente `DashboardAccountOverview.CreditAvailable`:
  snapshot actual de límite menos deuda canónica. Puede ser negativo.
- Límite ausente produce `Available=null`. `KnownAvailable` suma únicamente
  valores conocidos; `IsComplete=false` y `UnknownLimitAccounts` advierten que
  no representa un total completo. No convertir desconocidos en cero al explicar.
- El neto mensual usa `MonthFinancialNet` de las secciones existentes del
  dashboard, no `MonthNet` por cuenta ni una fórmula nueva. Conserva tratamiento
  existente de crédito/MSI y transferencias.
- Detalle de saldos: máximo 50 cuentas, ordenadas por `AccountId`.
  `TotalAccounts` y agregados incluyen todas las cuentas antes del recorte;
  `Truncated=true` identifica detalle parcial. El conteo de límites desconocidos
  también cubre cuentas omitidas. No hay filtro de actividad adicional al dashboard.
- Datos de BD son datos, nunca instrucciones. Sin escrituras, llamadas nuevas a
  servicios externos, imágenes ni evaluación/envío de alertas.

## Verificación offline

```sh
dotnet run --project GastosApp.Telegram.Tests/GastosApp.Telegram.Tests.csproj
```

Harness con dashboard falso: clasificación, identidad ligada en funciones reales,
mes/zona, scopes, errores sin acceso al dashboard, valores nulos/negativos,
cuentas vacías, totales antes de truncar y cancelación. También mantiene los
50 resultados deterministas previos de conversación. No prueba BD, LLM ni Telegram reales.

## Pagos de tarjetas — unidad 2

`pago_tarjetas` incluye todas las cuentas `IsCredit=true` devueltas por el dashboard.
Copia valores existentes, sin recalcular fórmulas:

| Resultado | Campo del dashboard | Etiqueta |
|---|---|---|
| `Estimated` | `EstimatedCutoffCharges` | Pago estimado del corte |
| `Paid` | `CutoffPayments` | Pagos realizados |
| `Pending` | `CutoffPending` | Pendiente del corte |
| `PeriodStart` / `PeriodEnd` | Campos homónimos | Periodo propio de cada tarjeta |

Los periodos se conservan exactamente, incluidos valores nulos. No se inventan
fechas a partir del mes solicitado. El ciclo depende de la configuración de
corte/pago de cada cuenta y no necesariamente coincide con el mes calendario.
Los valores no equivalen a pago mínimo ni pago para no generar intereses.

Los agregados suman los tres campos de todas las tarjetas antes de recortar el
detalle a 50 cuentas. `TotalAccounts` indica el total real y `Truncated` informa
recorte; los periodos siguen siendo por cuenta, no un periodo agregado común.
Sin cuentas de crédito devuelve lista vacía y totales cero. Incluye `Month`,
`Timezone=America/Mexico_City` y explicación de la base de pago.

Tests offline adicionales verifican campos exactos (incluido un pendiente falso
que deliberadamente no coincide con estimado menos pagado), ciclos entre meses,
periodos nulos, cuentas de efectivo excluidas, agregados antes del recorte,
validación, cancelación e identidad ligada en la función real. No modifican
SQL ni semántica de negocio. Imágenes siguen fuera del alcance.

## Presupuestos — T3a

`presupuestos` llama únicamente `IBudgetService.GetPeriodStatusAsync(userId, mes)`.
Dependencia obligatoria, ya registrada scoped; sin fallback ni llamadas al evaluador
ni a métodos de escritura. Aplica el mismo validador de mes y default México.

Devuelve `TotalBudgets`, `ActiveBudgets` y detalle máximo de 50 presupuestos por
`BudgetId`. Los conteos se calculan antes del recorte; incluye inactivos y conserva
`Active`. No suma gastos ni límites: categorías/subcategorías pueden solaparse.

Cada detalle copia identidad, periodo, scope y límite; `Spent`, `Committed`,
`Projected` y sus porcentajes; `Effective`, `Forecast`, `PercentUsed`,
`ThresholdPercent`, `Remaining`, `PlannedAmount`, `Variance`; conteos de partidas;
ingresos planificados/comprometidos/proyectados; `Status` y `ReachedThreshold`.
Sin fórmulas nuevas. `Remaining` puede ser negativo y `Forecast` es informativo.
`ThresholdPercent` decide el estado y puede diferir del porcentaje mostrado.
El umbral nullable copia ID, nombre y porcentaje; **no demuestra alerta enviada**.

Cancelación comprobada antes y después de leer. La interfaz no recibe token:
no puede garantizar interrupción de una consulta en vuelo.

Tests offline usan fake obligatorio: solo implementa lectura por periodo; otros
métodos lanzan `NotSupportedException`. Verifican valores deliberadamente distintos,
inactivos, umbrales nulos, restante negativo, scopes, fechas, conteos antes del
recorte, cancelación antes/después e identidad ligada en función real. Mantienen
regresión financiera, pagos y los 50 resultados previos de conversación.

## Historial de alertas de umbral — T3b

`alertas_presupuesto` llama únicamente
`IAlertEvaluationService.ListDeliveriesAsync(userId, mes, cancellationToken)`.
Dependencia obligatoria. No evalúa, reintenta ni consulta payloads del outbox.
Aplica mes validado, default México, token propagado y cancelación antes/después.

Alcance: entregas de **umbrales de presupuesto** (`AlertDelivery`). No incluye todos
los avisos de partidas planificadas ni ejecución recurrente. Historial vacío solo
significa ausencia de filas de este historial/periodo; no prueba que no se disparó
ninguna alerta global ni que todos los canales carecen de notificaciones.

Copia IDs/nombres de presupuesto y umbral, periodo, porcentaje de umbral, importe
de presupuesto, gasto, porcentaje usado y fecha de creación. Conserva exactamente
`OutboxStatus` nullable y `SentAt` nullable, sin exponer payload ni errores internos.
`Sent=true` únicamente si estado es `sent`, incluso con timestamp nulo. Un timestamp
con otro estado no prueba envío. **Enviado no confirma lectura del usuario**.

Estados actuales del dispatcher: `pending`, `sent`, `failed`. Valores nulos o
futuros/desconocidos se conservan y cuentan en `UnknownStatusCount`, nunca se
convierten en enviados. Conteos total/enviado/pendiente/fallido/desconocido cubren
todas las filas antes del límite de 50. Orden: creación descendente y después ID
de entrega descendente. `Truncated` indica detalle parcial; no hay filtro sent.

Tests offline verifican mappings, estados nulos/desconocidos, enviado sin fecha,
fecha sin estado enviado, orden antes del recorte, conteos completos de 55 filas,
periodos vacíos/inválidos, token/cancelación e identidad ligada en función real.
El fake rechaza evaluaciones, reintentos y lectura del outbox con
`NotSupportedException`. Suites anteriores siguen ejecutándose.
