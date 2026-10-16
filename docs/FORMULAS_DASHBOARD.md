# Fórmulas y definiciones aprobadas del dashboard

Referencia de las decisiones aprobadas durante la revisión del dashboard. **Describe el comportamiento acordado, no garantiza que el código actual ya lo implemente.** La conciliación con datos y la centralización de cálculos son una etapa posterior. No modifica transacciones ni obligaciones.

## 1. Reglas generales

- Cada movimiento se cuenta una sola vez en el total correspondiente.
- Separar consumo/gasto, flujo de efectivo y deuda. No son métricas intercambiables.
- Identificar importes reales, pendientes y estimados; ausencia de información no equivale a cero observado.
- Los cálculos aprobados deben ser compartidos por sus consumidores; las pestañas no deben reconstruir fórmulas financieras diferentes.

| Concepto | Definición aprobada |
| --- | --- |
| Ingreso | Entrada directa que incrementa una cuenta de efectivo, sin transferencias. |
| Gasto | Gasto directo en una cuenta, sin transferencias. Incluye compras con tarjeta como gasto del periodo de compra. |
| Pago de tarjeta | Transferencia de efectivo a crédito: disminuye efectivo y deuda; no genera un nuevo ingreso ni gasto. |
| Flujo | Incluye movimientos y transferencias distinguiendo sus tipos. No sumar ambos lados de un traspaso propio como entradas/salidas externas del consolidado. |
| Deuda pendiente | Obligaciones exclusivamente de crédito, separando normal y MSI. |

**Ejemplo:** una compra con tarjeta de $1,000 afecta el gasto/neto al comprar. Su pago posterior afecta efectivo y deuda, pero no genera otros $1,000 de gasto.

## 2. Fechas y periodos

| Información | Referencia temporal aprobada |
| --- | --- |
| Ingresos, gastos, presupuesto y desviación | Mes calendario seleccionado. |
| Obligaciones del corte | Ciclo de cada tarjeta, indicando inicio, corte y fecha límite de pago. No confundir con mes calendario. |
| Deuda pendiente, disponible y utilización | Estado actual con fecha de actualización. Elegir un mes pasado no transforma estos datos en una fotografía histórica. |
| Efectivo al cierre del mes actual | Saldo de hoy más entradas pendientes menos salidas pendientes hasta fin de mes. |
| Meses futuros | Escenarios proyectados, separados de resultados reales. |

No inventar nuevas fechas para deudas vencidas ni trasladarlas automáticamente al primer mes proyectado.

## 3. Crédito: deuda total, vencimientos y vencidos

Por tarjeta:

```text
Deuda pendiente total = deuda normal pendiente + deuda MSI pendiente
Pago pendiente del mes = obligaciones normales pendientes que vencen ese mes
                       + cuotas MSI pendientes que vencen ese mes
Deuda vencida = obligaciones pendientes cuya fecha de pago ya pasó
```

- La deuda total incluye obligaciones de cualquier vencimiento, incluidas las vencidas.
- Los vencidos son un subconjunto de la deuda total: no se suman otra vez.
- La deuda MSI total incluye todas las cuotas pendientes; el pago mensual solo incluye las cuotas de ese mes, no todo el capital futuro.
- Mantener desglose por tarjeta y normal/MSI.
- Una tarjeta inactiva con deuda sigue visible e identificada como inactiva; sin deuda se quita del listado de deuda/obligaciones. No habilitar nuevas operaciones por mostrarla.
- Esta regla no oculta tarjetas activas sin deuda ni elimina saldos a favor o pagos sin aplicar.

## 4. Obligaciones completas del corte

El usuario paga **todo lo pendiente del periodo**, no un mínimo estimado.

```text
Obligaciones originales del corte = cargos normales correspondientes al ciclo
                                 + cuotas MSI correspondientes a su fecha de pago
Pendiente de esas obligaciones = obligaciones originales
                              - pagos válidos aplicados a esas mismas obligaciones
```

Mostrar por separado:

1. Crédito normal del corte.
2. Cuotas MSI del periodo, sin cuotas futuras.
3. Total original de obligaciones.
4. Pagos aplicados, contados una sola vez.
5. Pendiente por pagar.
6. Vencidos y saldo a favor/pagos sin aplicar, separados.

No mezclar cargos originales con cuotas ya reducidas por pagos para luego restar nuevamente esos pagos. Un pago sin aplicación no reduce automáticamente una obligación concreta. No ocultar sobrepagos dentro de un piso artificial de cero: identificar su naturaleza por separado.

La intención de pagar todo no equivale a un pago realizado. Este cálculo interno no se presenta como pago mínimo ni como pago bancario para no generar intereses sin información que lo respalde.

## 5. Línea, disponible y utilización

```text
Disponible = línea de crédito registrada - deuda pendiente total
Utilización (%) = deuda pendiente total / línea de crédito registrada × 100
```

- La línea autorizada solo cambia al actualizar la cuenta.
- Pagar reduce deuda y recupera disponible; no incrementa la línea.
- Saldo a favor se muestra separado y no modifica la línea autorizada.
- Mostrar disponible negativo y utilización superior a 100 % si existe exceso.
- Sin límite registrado: indicar «sin límite registrado», sin inventar disponible ni porcentaje.
- No dividir por cero; la presentación de un límite explícito igual a cero queda pendiente de definición.
- **Presentación por cuenta (dashboard):** la tarjeta de una cuenta de crédito muestra «Deuda pendiente» y «Disponible» a partir de los campos canónicos (`currentDebt` y `creditAvailable`; si el segundo falta, `creditLimit - deuda pendiente`). El saldo contable (apertura, cierre, neto) no se presenta como deuda ni como disponible: cuando se muestra, se rotula «saldo contable».
- Esta regla aplica a todas las tarjetas de crédito por igual; no hay excepciones por signo, importe ni cuenta.
- Las cuentas de efectivo conservan su «saldo actual» y los totales de efectivo no cambian.
- La corrección es solo de presentación: no muta el libro mayor, no recalcula movimientos, no llama a ningún endpoint de recálculo y **no concilia saldos iniciales**; solo cambia la etiqueta y la fuente mostrada.

## 6. Inversiones

| Concepto | Fórmula o definición aprobada |
| --- | --- |
| Capital invertido | Dinero destinado a inversión, sin rendimientos futuros. |
| Rendimiento estimado mensual | Ganancia esperada del mes según saldo, tasa y condiciones de cada inversión; excluye capital. |
| Rendimiento real registrado | Ganancia efectivamente registrada. No duplicar como estimada para el mismo periodo. |
| Saldo proyectado al cierre | Capital + aportaciones − retiros + rendimientos acumulados, según exista reinversión. |

La proyección mensual usa el rendimiento estimado del mes, no el capital ni el saldo final. Distinguirlo de ingreso real: no es efectivo recibido hasta registrar su abono. Solo incrementa el efectivo previsto si se espera su abono a una cuenta de efectivo durante el periodo.

**Pendiente:** aprobar la fuente común de saldo/tasa/plan, horizonte, forma de capitalización y reglas de conciliación entre dashboard e Inversiones. Las fórmulas financieras específicas de tasas no quedaron aprobadas en esta revisión.

**Nota de alcance:** la corrección de presentación de deuda/disponible en las tarjetas de crédito del dashboard no define la fuente de inversiones ni modifica sus fórmulas; la fuente común de saldo/tasa/plan entre dashboard e Inversiones sigue pendiente.

## 7. Presupuesto, ejecución y fuera del plan

Calcular ingresos y gastos por separado.

| Componente | Definición |
| --- | --- |
| Planeado total | Partidas pendientes y ejecutadas del mes; excluye canceladas e ignoradas. |
| Ejecutado del plan | Importe real de movimientos vinculados a partidas ejecutadas. |
| Pendiente del plan | Importe previsto de partidas todavía pendientes. |
| Fuera del plan, por presupuesto | Movimientos reales sin partida vinculada dentro de categoría/subcategoría configuradas. Una categoría completa incluye sus subcategorías. |
| Fuera del plan, total dashboard | Todos los ingresos y gastos reales sin partida vinculada, incluso en categorías sin presupuesto. Excluye transferencias. |

```text
Cierre previsto = ejecutado real del plan + planeado pendiente + real fuera del plan
```

El total se obtiene de movimientos únicos, no sumando subtotales de presupuestos que pueden solaparse. Las compras a crédito son gasto; los pagos de tarjeta se consideran en efectivo, no como otro gasto.

**Ejemplo aprobado:** gasto planeado $1,000; una partida planeada de $400 se ejecuta por $450; pendientes $600; fuera del plan $100. Cierre previsto de gasto = $450 + $600 + $100 = $1,150, no $1,000 más lo ya ejecutado.

## 8. Desviaciones y efecto sobre el neto

```text
Desviación de ingresos = cierre previsto de ingresos - ingresos planeados
Desviación de gastos = cierre previsto de gastos - gastos planeados
Efecto sobre el neto = desviación de ingresos - desviación de gastos
```

- Ingresos: positivo significa ingresos adicionales.
- Gastos: positivo significa sobregasto; negativo significa menor gasto.
- El gasto adicional de $150 del ejemplo anterior reduce el neto en $150 si los ingresos no cambian.

### Muestra histórica

Usar meses comparables disponibles dentro de los **últimos tres meses completos**, mostrando periodos y tamaño de muestra. Con uno o dos meses puede calcularse el promedio; no exigir tres como bloqueo.

```text
Ajuste histórico promedio = suma de efectos netos comparables / número de meses comparables
```

Sin meses comparables, no dividir ni inventar desviación: el escenario estimado coincide con el registrado e indica «sin datos para estimar desviaciones», no «desviación cero».

Criterios aprobados:

1. Con plan y movimientos reales: pueden calcularse desviaciones.
2. Con plan sin movimientos reales: solo partidas confirmadas como no realizadas pueden contar como desviación. Una pendiente antigua no demuestra ahorro o ingreso perdido.
3. Sin plan: los movimientos son histórico, no desviación frente a un plan inexistente.

**Pendiente:** definir cómo registrar la confirmación de no realización y el tratamiento exacto de meses parcialmente resueltos o vínculos entre periodos. No asumir que un estado actual del sistema expresa esa confirmación.

## 9. Neto mensual y efectivo al cierre

Son resultados distintos:

```text
Neto mensual previsto = ingresos previstos - gastos previstos
Efectivo previsto al cierre = efectivo actual
                           + entradas pendientes de efectivo
                           - gastos directos pendientes de efectivo
                           - pagos pendientes de crédito normal
                           - pagos pendientes MSI
```

- En el neto, la compra financiada es gasto; su pago no vuelve a descontarse.
- En efectivo, la compra financiada no es una salida inmediata; el pago sí lo es.
- Movimientos ya realizados están incorporados en el saldo actual: no sumarlos/restarlos nuevamente.
- Mostrar componentes por separado, no solo un importe neto.
- Rendimientos reales y estimados deben seguir la separación del apartado de inversiones, sin doble conteo.

## 10. Dos escenarios, no dos fórmulas incompatibles

| Escenario | Regla aprobada |
| --- | --- |
| Registrado | Datos reales y partidas pendientes; obligaciones identificadas para su efecto en efectivo. Sin relleno histórico automático. |
| Estimado por desviaciones | Misma base registrada ajustada por las desviaciones históricas comparables. |

No sumar el histórico completo encima del plan ni reemplazarlo por una tendencia independiente. No sustituir todo un mes por un histórico solo porque el plan sea parcial. Ambos escenarios distinguen neto de efectivo y muestran origen y componentes.

El efecto histórico sobre efectivo debe respetar la clasificación efectivo/crédito: un ajuste de gasto financiado no es automáticamente una salida de efectivo. La asignación detallada del ajuste entre neto y efectivo debe revisarse antes de implementar.

## 11. Estado y siguientes decisiones

- Este documento registra acuerdos; las diferencias con el código actual todavía necesitan conciliación.
- No se autorizan cambios de datos, SQL, implementación o presentación por crear este documento.
- Pendientes principales: fuente comparable de inversiones, precisión de fechas/horas de corte, confirmación de partidas no realizadas, casos de límite cero, vínculos entre periodos y aplicación detallada de desviaciones al efectivo.
- Tras aprobar pendientes: contrastar casos reales, definir fuente compartida y después ajustar presentación.

### Rutas del inventario actual (no autoridad de las fórmulas aprobadas)

- Backend: `GastosApp.BusinessLogic/Services/Dashboard/DashboardService.cs` y `DashboardProjectionCalculator.cs`.
- Contratos: `GastosApp.BusinessLogic/Models/Dashboard/` y `GastosApp.Web/lib/contracts/dashboard.ts`.
- Crédito/corte actual: `SQL/schema.sql`, función `fn_dashboard_credit_overview`.
- Derivaciones frontend: `GastosApp.Web/app/(app)/dashboard/_lib/dashboard-metrics.ts` (`resolveAccountCredit`, `resolveAccountBalanceDisplay`), `projection-chart.ts` y componentes de las pestañas.
- Fuera del dashboard (pendiente): el listado administrativo de cuentas (`app/(app)/accounts/_components/accounts-table.tsx` y `accounts-mobile-list.tsx`) usa el contrato `Account` (`lib/contracts/accounts.ts`), que solo expone `currentBalance` y `creditLimit`, sin deuda ni disponible canónicos. Su corrección requiere esa fuente canónica y queda para una etapa posterior; no se debe derivar deuda desde el saldo genérico.
- Inversiones: `GastosApp.BusinessLogic/Services/Investments/InvestmentCalculator.cs` y `GastosApp.Web/app/(app)/investments/_lib/investment-dashboard.ts`.
