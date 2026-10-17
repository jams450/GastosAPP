# Corrección del cálculo de obligaciones del corte

## Defecto reproducido

El componente MSI del corte sumaba cuotas ya reducidas por aplicaciones de pagos y después el pendiente volvía a restar pagos aplicados. Una cuota original de 1,000 con 200 aplicados podía mostrar 600 pendientes, cuando la identidad correcta es 1,000 − 200 = 800.

Además, las cuotas MSI originales y sus aplicaciones se seleccionaban con ventanas distintas: las cuotas por intervalo de vencimiento y los pagos únicamente por el día final.

## Corrección preparada

- Sumar el importe original completo de cuotas MSI del periodo, incluidas las cuotas `Paid`, y restar aplicaciones válidas `Posted` una sola vez.
- Usar la misma ventana de vencimiento y los mismos estados de cuota para cargos y aplicaciones MSI.
- Para pagos de obligaciones normales, seleccionar sus cargos de origen en el ciclo correspondiente.
- Mantener firma y columnas de `fn_dashboard_credit_overview`; no recalcular ni modificar saldos o movimientos.

Esto corrige una identidad verificable. **No certifica que el resultado sea el importe bancario para no generar intereses**, ni resuelve por sí solo inconsistencias históricas de estados o aplicaciones.

## Artefactos y aplicación

- Esquema nuevo: `SQL/schema.sql`.
- Base existente: `SQL/migrations/2026-10-16_dashboard_cutoff_msi_original_payments.sql`.
- Regresión: `SQL/audits/test_dashboard_cutoff.py`.

La migración está preparada **pero no ejecutada**. Cambia la definición de una función, aunque no actualiza filas; por ello requiere autorización explícita de cambio de base. Reiniciar o desplegar la API sin aplicarla no actualiza esa función en una base existente.

Antes de aplicarla, el operador debe conservar la definición actualmente desplegada como reversión, validar el artefacto en PostgreSQL aislado y acordar la ventana de aplicación. No se incluye un ejecutor automático ni se autorizan migraciones por este documento.

## Evidencia y límites

- RED observado con expresión extraída del SQL real: pendiente 600 frente a 800 esperado.
- Dos pruebas deterministas pasan tras la corrección; SQLite comprueba aritmética y límites estructurales, no sustituye PostgreSQL.
- El cuerpo de la función en esquema y migración se comprobó idéntico byte a byte.
- Revisión independiente de aritmética, aplicaciones y fanout realizada; revalidación limitada del artefacto aprobada sin bloqueos. Firma, 24 columnas y cuerpo de función coinciden; no contiene recálculos ni escrituras de filas.
- Sin consultas adicionales a producción, sin migraciones ejecutadas y sin certificación bancaria.

### Discrepancias que no deben ocultarse

Una cuota marcada `Paid` con aplicaciones válidas insuficientes puede mostrar residual bajo la fórmula original menos aplicaciones. Es una inconsistencia a investigar, no autorización para crear pagos ni cambiar estados. La deuda heredada `opening_credit`, estados revertidos/cancelados y saldos a favor requieren conservar su naturaleza explícita; esta corrección no los normaliza automáticamente ni elimina el piso heredado de `CutoffPending`.
