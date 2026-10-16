# Revisión del dashboard: acuerdos frente al commit guardado

Esta revisión es estática, sobre el código heredado de `9bf5881`. No equivale a una revisión visual en navegador ni a una conciliación bancaria. La conciliación de producción independiente está en `CONCILIACION_CREDITO_SERVIDOR.md`. No se implementaron nuevas proyecciones o inversiones.

## Diferencias con los acuerdos

| Área | Código observado | Acuerdo / consecuencia |
| --- | --- | --- |
| Cuentas inactivas | `SQL/schema.sql`, `fn_dashboard_credit_overview`, filtra `active = TRUE`; `dashboard-metrics.ts` también filtra activas | Una inactiva con deuda debe permanecer visible. No hubo inactivas de crédito en el snapshot observado, pero el contrato sigue incompleto. |
| Normal/MSI del corte | SQL expone cargos combinados; `DashboardCreditOverview` no separa los dos componentes del corte | Mostrar originales normales y cuotas MSI, aplicaciones válidas y pendiente por separado. Deuda total no es pago del mes. |
| Sobrepagos | `cutoff_pending = GREATEST(charges-payments,0)` | El piso oculta el exceso; requiere saldo a favor y pagos sin aplicar separados, no modificar la línea. |
| Vencidos | Cuotas `Overdue` incluidas dentro de deuda normal/MSI sin desglose específico | Vencidos son subconjunto de deuda, no una suma adicional ni obligación con nueva fecha. |
| Aplicaciones del corte | Filtro de fecha de vencimiento igual al fin de pago | Debe revisarse frente al ciclo real; no hay evidencia del snapshot agregado para afirmar que un pago concreto esté omitido. |
| Muestra histórica | Calculadora exige tres periodos para suficiencia | Acuerdo permite 1–3 meses comparables; sin muestra no inventar desviación. |
| Pendientes antiguas | Calculadora puede tratar partidas sin ejecución como ahorro o ingreso perdido | Falta confirmación de no realización; pendiente antigua por sí sola no demuestra desviación. |
| Efectivo proyectado | Acumulación de neto sobre saldo real | No reemplaza desglose aprobado de entradas, gastos directos y pagos normal/MSI pendientes. No implementar aún. |
| Responsables | Deuda por cuenta; asignaciones de gasto no se conectan al payload de deuda | Hay ruta entre cargo, transacción y responsable, pero pagos solo se aplican a cuotas. Falta regla de atribución de pagos y deuda sin asignación. |

Fuentes principales: `GastosApp.BusinessLogic/Services/Dashboard/DashboardService.cs`, `DashboardProjectionCalculator.cs`, `Models/Dashboard/DashboardCreditOverview.cs`, `SQL/schema.sql`, `GastosApp.Web/app/(app)/dashboard/_lib/dashboard-metrics.ts` y `_components/tabs/credito-tab.tsx`. Los acuerdos vigentes están en `FORMULAS_DASHBOARD.md` y §3 de `PLAN_REANUDACION_DASHBOARD.md`, no en la tarea histórica.

## Diseño recomendado sin inventar cifras

1. Mantener deuda normal, deuda MSI, total y disponible como conceptos separados; utilizar etiquetas explícitas de snapshot actual frente al mes seleccionado.
2. En Crédito, barras apiladas por tarjeta para normal/MSI y referencia de línea registrada; conservar exceso visible y no dibujar disponible cuando falte límite.
3. Utilizar colores semánticos existentes (`--color-credit`, `--color-info`, `--color-warning`, `--color-danger`), leyenda y valores textuales; nunca depender solo del color.
4. Tabla por responsable en Crédito, con columnas normal, MSI y total, una vez definida atribución y conciliación exacta con totales por cuenta. Mostrar falta de asignación explícitamente; no atribuirla automáticamente.
5. No añadir gráficos de vencidos o saldo a favor a partir de campos que hoy no existen. No presentar el corte estimado como mínimo bancario ni importe para no generar intereses.
6. No añadir más variantes de proyección: siguen vigentes exactamente dos escenarios y la separación neto/efectivo.

## Prueba visual y límites

No se ejecutó navegador autenticado: no hay sesión proporcionada y está prohibido crear sesiones para esta conciliación. TypeScript y las 314 pruebas existentes pasaron para las mejoras de formularios; eso no prueba contraste, responsive ni interacción visual. Los cambios de formulario se guardaron por separado: `b26fbcf` (detalles abiertos) y `ba8fd2d` (sin cierre exterior). No hubo despliegue ni push.
