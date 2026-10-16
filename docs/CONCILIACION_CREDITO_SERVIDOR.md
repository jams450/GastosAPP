# Conciliación de crédito del servidor

## Lectura y garantías

Snapshot único: **2026-10-16 04:41:10.444427 UTC**, base de producción confirmada por el usuario. Transacción `REPEATABLE READ`, `transaction_read_only=on`, timeout de sentencia 30 segundos, bloqueo 3 segundos y `ROLLBACK` completado antes de emitir informe. Sin login, actualizaciones, migraciones ni recálculos. Propietario único de cuentas de crédito verificado antes de leer importes; cinco cuentas activas, 365 movimientos.

Consulta reproducible: `SQL/audits/credit_reconciliation.sql`. Ejecutor: `SQL/audits/CreditReconciliation/`. Informe detallado privado y excluido de Git: `artifacts/credit-reconciliation/snapshot.json`. No contiene credenciales; no debe publicarse automáticamente.

## Resultado por cuenta

Importes en MXN. Impactos persistidos y reconstrucción heredada del dashboard coinciden en esta lectura: no hubo movimientos que activaran el fallback. Saldo contable no equivale a deuda ni disponible.

| Cuenta | Línea | Inicial | Actual contable | Impactos | Residual actual−inicial−impactos | Normal | MSI | Disponible |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Banamex Joy | 180,000.00 | 162,963.63 | 176,591.98 | 13,628.35 | 0.00 | 0.00 | 3,408.02 | 176,591.98 |
| BBVA Platino | 362,500.00 | 278,913.75 | 341,293.69 | −1,108.55 | **63,488.49** | 6,988.15 | 13,828.20 | 341,683.65 |
| Didi Prestamo | 2,400.00 | 2,400.00 | 2,400.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2,400.00 |
| Revolut Credito | 170,000.00 | 170,000.00 | 168,528.99 | −1,471.01 | 0.00 | 1,471.01 | 0.00 | 168,528.99 |
| Openbank Credito | 200,000.00 | 0.00 | −1,129.31 | −1,129.31 | 0.00 | 1,129.31 | 0.00 | 198,870.69 |
| **Total** | **914,900.00** | **614,277.38** | **687,685.35** | **9,919.48** | **63,488.49** | **9,588.47** | **17,236.22** | **888,075.31** |

Deuda total: **26,824.69** = normal 9,588.47 + MSI 17,236.22. Disponible total: 914,900.00 − 26,824.69 = 888,075.31. Totales base independientes de cuentas, movimientos e impactos comprobados por el ejecutor. Deudas por cuenta contrastadas contra la función desplegada del dashboard en el mismo snapshot; cinco coincidencias. Hash MD5 de la definición desplegada: `d980b66970c18fac4dd305b373be71ca` (identificador de evidencia, no prueba de igualdad textual con el repositorio).

## Diferencias comprobadas y límites de interpretación

1. **BBVA rompe la identidad contable:** 278,913.75 − 1,108.55 = **277,805.20**, pero el saldo guardado es 341,293.69. Diferencia: **63,488.49**. La fotografía no permite atribuir la causa a una persona, proceso, recálculo o saldo inicial incorrecto.
2. **BBVA tiene 1,378.45 de importe de cuotas con estado `Paid` no cubierto por aplicaciones de pagos `Posted`.** La fórmula canónica excluye esas cuotas por estado. No demuestra impago: puede faltar evidencia de aplicaciones, existir estado heredado u otra explicación. No sumar este importe a deuda automáticamente.
3. El saldo BBVA difiere del disponible canónico en **−389.96**. Eso no es el residual contable y no prueba que deba sustituirse el saldo por el disponible.
4. Los movimientos `opening_credit` suman 12,164.05 en Banamex y 3,143.32 en BBVA. Se informan por separado; no se suman otra vez a impactos ni se eliminan. La deuda heredada y el libro contable son fuentes distintas.
5. No se observaron sobreaplicaciones ni aplicaciones `Posted` cruzadas entre cuentas. Esto no constituye conciliación contra estados de cuenta bancarios.
6. El código del dashboard filtra cuentas activas; esta consulta incluye también inactivas. En este snapshot las cinco cuentas de crédito eran activas. La incompatibilidad con el acuerdo de mostrar inactivas con deuda sigue siendo un hallazgo de código, no un importe faltante observado.

## Propuestas: ninguna modificación autorizada

| Campo | Valor actual | Valor candidato condicionado | Motivo y condición |
| --- | ---: | ---: | --- |
| BBVA `current_balance` | 341,293.69 | 277,805.20 **solo si** inicial e impactos son completos y correctos | Restablecería identidad contable; no hay evidencia para recomendarlo como corrección definitiva. |
| BBVA `initial_balance` | 278,913.75 | 342,402.24 **solo si** actual e impactos son completos y correctos | Alternativa mutuamente excluyente a la anterior; también elimina residual. No elegir sin respaldo histórico. |
| Cuotas BBVA `Paid` con residual | 1,378.45 agregado sin cobertura Posted | **Sin propuesta numérica de cambio** | Faltan identificadores de cuotas y trazabilidad del pago/estado; no crear pagos ficticios ni cambiar deuda por inferencia. |

**Bloqueo concreto:** el snapshot agregado no permite distinguir saldo inicial incorrecto, saldo actual incorrecto o movimientos/aplicaciones históricos ausentes. Se necesita evidencia de apertura/estado bancario o autorización para una consulta focalizada posterior de trazabilidad. No se repetirá esta auditoría automáticamente. Cualquier modificación exige una decisión explícita por campo y cuenta; ningún SQL de escritura se ha preparado.

## Reproducción y checks observados

```bash
python3 SQL/audits/test_credit_reconciliation.py
dotnet build SQL/audits/CreditReconciliation/CreditReconciliation.csproj
# Solo con autorización de una nueva lectura, no repetir por rutina:
dotnet run --no-build --project SQL/audits/CreditReconciliation/CreditReconciliation.csproj -- --read-production
```

- Cuatro pruebas deterministas de agregación aprobadas con SQLite; no sustituyen la ejecución PostgreSQL.
- Compilación del lector: cero errores/advertencias; ejecución PostgreSQL observada exitosa.
- Verificación independiente: sin bloqueos duros antes del snapshot. Reconstrucción heredada por orden de transferencia se conserva solo para concordancia, no como prueba del sentido financiero correcto.
- Guarda sin bandera explícita: salida 2 y sin conexión.
- Revisión bancaria, browser autenticado y revisión nativa: no ejecutados.
