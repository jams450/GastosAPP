# Catálogo de cuentas: efectivo y crédito

El catálogo presenta dos secciones en la misma página, con el resultado de los filtros existentes:

| Sección | Columnas financieras |
| --- | --- |
| Efectivo | Saldo actual y saldo inicial |
| Crédito | Línea, deuda normal, deuda MSI, deuda total y crédito disponible |

Las acciones, el estado activo/inactivo y el enlace al histórico anual se conservan. Las cuentas inactivas no se eliminan de la consulta: siguen sujetas al filtro de estado elegido. Los saldos contables de crédito permanecen en edición/historial, no se presentan como deuda ni disponible.

## Fuente de crédito

`GET /api/accounts` agrega campos opcionales `normalOutstanding`, `msiOutstanding`, `currentDebt` y `creditAvailable`. Otros endpoints de cuentas pueden no proporcionarlos.

La deuda se calcula desde cuotas pendientes (`Open`, `PartiallyPaid`, `Overdue`), menos aplicaciones de pagos `Posted`, con piso por cuota. Se separan planes `Revolving` y `MSI`; deuda total es su suma y disponible es línea menos deuda. No se utiliza `currentBalance` para inferir deuda.

- Una cuenta consultada sin cuotas pendientes tiene deuda observada cero.
- Un campo ausente se muestra como **No disponible**, no como cero.
- Sin línea registrada no se inventa disponible.
- Disponible negativo se conserva cuando hay exceso.

Es una consulta de lectura por propietario, sin migración ni cambio de saldos. No depende de la función de dashboard que filtra cuentas activas. No sustituye la conciliación de estados de cuenta, ni resuelve estados `Paid` inconsistentes o pagos sin aplicación.

## Validación y límites

Pruebas locales del cálculo y de la partición/normalización frontend cubren los casos solicitados sin datos reales. La traducción de la consulta EF se inspeccionó, pero no se ejecutó contra producción. La revisión en navegador autenticado no está realizada. Los checks y el veredicto independiente final se registran en `odd/tasks/accounts-cash-credit-tables.md`.

No se requiere SQL adicional para este catálogo. La migración de pago del corte preparada en el trabajo anterior es independiente y sigue pendiente de aplicación autorizada.
