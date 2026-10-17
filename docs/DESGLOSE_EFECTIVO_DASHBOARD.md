# Desglose de efectivo del dashboard

## Componentes del mes seleccionado

| Concepto | Incluye | No incluye |
| --- | --- | --- |
| Gasto directo del mes | Movimientos de gasto en cuentas de efectivo | Compras a crédito, pagos a tarjetas y traspasos propios |
| Pagos a tarjeta de crédito | Transferencias de efectivo a crédito, contadas una vez | Un nuevo gasto de consumo |
| Transferencias internas | Transferencias entre cuentas de efectivo, contadas una vez | Entrada o salida del efectivo consolidado |
| Salida total de efectivo | Gasto directo + pagos a tarjeta | Transferencias internas |

Ejemplo: gasto directo de 100, pago a tarjeta de 200 y traspaso propio de 300 producen gasto directo 100, pagos a tarjeta 200, transferencias internas 300 y salida consolidada 300. Una compra con tarjeta se reconoce como consumo al comprar, no otra vez al pagarla.

## Compatibilidad

El backend agrega a `cashSummary` los campos `monthDirectExpense`, `monthCardPayment`, `monthInternalCashTransfer` y `monthCashOutflow`. Los campos heredados `monthExpense`, `monthNet` y `monthFinancialNet` no cambian: otros consumidores y proyecciones conservan su semántica previa.

La vista normalizada usa `hasCashFlowBreakdown` para saber si llegó el desglose. Con un backend anterior conserva la presentación heredada; no inventa una separación de importes ausentes. El neto financiero heredado no se redefine como gasto de consumo.

Los pares de transferencia y las filas únicas con contraparte comparten la resolución de origen/destino. Las reglas heredadas para avances crédito→efectivo y transferencias crédito→crédito no se modifican. No se alteran saldos, movimientos ni pagos persistidos.

## Verificación y límites

- Pruebas deterministas de gasto directo, pagos, traspasos y compatibilidad de pares/filas únicas: RED y GREEN observados por el escritor.
- Comprobación integrada del padre: pruebas backend, TypeScript sin incremental y 319 pruebas frontend aprobadas.
- Verificación independiente aprobada sin bloqueos: build sin advertencias/errores, 58 + 8 + 5 + 12 comprobaciones backend, TypeScript y 319 pruebas frontend; siete sondas independientes adicionales aprobadas.
- No se consultó producción ni se inició sesión. No hay prueba visual autenticada.
- El cálculo del pago estimado del corte es una unidad distinta: no debe inferirse de estos totales de efectivo.
