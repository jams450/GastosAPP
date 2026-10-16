# Reanudar revisión y conciliación del dashboard en el servidor

## Estado al guardar

El usuario pidió: «primero has commit y crea el plan md esta compu se apagara y seguiras desde el server».
Este documento permite continuar sin depender de memoria local ni de archivos temporales de esta computadora.

**Prioridad siguiente: conciliación verificable de crédito, no más cambios de presentación ni ajustes automáticos de saldos.**

## 1. Qué se guarda en el commit

- Backend de proyección con presupuesto, inversiones, MSI, crédito normal y escenarios base/ajustado.
- Calculadora pura y pruebas ejecutables en `GastosApp.Dashboard.Tests/` (fuera de `code.sln`).
- Contratos y visualización frontend de escenarios/componentes.
- Corrección de tarjetas dashboard: deuda/disponible canónicos, no derivados del signo de `currentBalance`. Efectivo sin cambios.
- `docs/FORMULAS_DASHBOARD.md` y documento histórico `odd/tasks/dashboard-budget-investment-projection.md`.

**Advertencia:** la implementación de proyecciones antecede a varios acuerdos conceptuales posteriores. No considerarla implementación completa de todas las reglas aprobadas. Algunos campos heredados y reglas de muestra deben reconciliarse antes de continuar. El documento histórico contiene estados y bloqueos anteriores: este plan describe el punto actual de reanudación.

El módulo administrativo de cuentas todavía puede mostrar saldo genérico; no fue corregido ni debe inferir deuda invirtiendo signos.

## 2. Alcance y permisos

- El usuario confirmó `.env` local como destino de pruebas; ejecuta pruebas mediante pnpm. Producción está en otro servidor con Docker.
- NO asumir que el `.env` del servidor coincide con la base consultada anteriormente.
- Autorización de datos vigente: **solo lectura** de cuentas de crédito, movimientos y obligaciones.
- No ejecutar UPDATE, migraciones, recálculos de saldo ni login de pruebas que cree sesiones como parte de esa lectura.
- No copiar secretos a documentos, comandos visibles, commits o reportes.
- Antes de modificar datos: propuesta por cuenta con valor actual, valor propuesto, evidencia y autorización explícita.
- Commit autorizado ahora. Push, merge y despliegue NO solicitados. Para llevar el commit a otro equipo hará falta transferencia/push autorizado; no asumir que ya existe allí.

## 3. Acuerdos que deben preservarse

Leer primero `docs/FORMULAS_DASHBOARD.md`; completar su conciliación con estos acuerdos posteriores:

1. Ingreso directo incrementa efectivo y excluye transferencias. Gasto directo excluye transferencias; compras con tarjeta cuentan como gasto, pagar tarjeta no genera otro gasto.
2. Pago de tarjeta = transferencia efectivo → crédito. Flujo incluye movimientos y transferencias sin duplicar ambos lados en consolidado.
3. Deuda total normal+MSI; obligaciones por mes/corte; vencidos separados como subconjunto, sin inventar fecha nueva.
4. Se paga TODO lo pendiente del corte, no mínimo. Separar obligaciones originales, pagos aplicados una sola vez, pendiente y saldo a favor/pago sin aplicar.
5. Inactiva con deuda aparece; sin deuda se excluye de deuda/obligaciones. No ocultar activas sin deuda.
6. Línea solo cambia al editar cuenta; disponible=línea-deuda; utilización=deuda/línea. Mostrar exceso; no inventar límite ni dividir por cero.
7. Inversiones: capital, rendimiento estimado mensual, rendimiento real y saldo final separados. Usuario aprobó **plan guardado como fuente oficial compartida**; saldo actual como simulación explícita; sin cobertura significa sin proyección disponible, no rendimiento cero. No duplicar abonos reales como estimados.
8. Cierre de ingresos/gastos = ejecutado real del plan + pendiente planeado + real fuera del plan. Presupuesto específico respeta categoría/subcategoría; total incluye todos los movimientos únicos sin partida, sin sumar presupuestos solapados.
9. Desviación ingresos=cierre-planeado; gastos=cierre-planeado; efecto neto=desviación ingresos-desviación gastos.
10. Neto mensual=ingresos previstos-gastos previstos. Efectivo al cierre=efectivo actual+entradas pendientes-gastos directos pendientes-pagos normal-pagos MSI. No volver a sumar movimientos ya incluidos en saldo actual. Ajustes financiados no son salidas inmediatas de efectivo.
11. Exactamente dos escenarios: registrado sin relleno histórico y registrado+desviaciones históricas. No tendencia completa adicional ni sustitución automática de plan parcial.
12. Últimos tres meses completos: usar **1–3 meses comparables disponibles**, no exigir tres como bloqueo. Sin muestra: estimado=registrado y aviso «sin datos para estimar desviaciones».
13. Con plan+movimientos puede haber comparación; pendientes antiguas sin realización confirmada NO generan ahorro/ingreso perdido; sin plan es histórico pero no desviación. Falta definir cómo confirmar no realización y resolver meses parciales/vínculos entre periodos.
14. Ingresos/gastos/presupuesto por mes seleccionado; corte por ciclo y fechas explícitas; deuda/disponible snapshot actual. Mes pasado no transforma deuda actual en histórica.

## 4. Qué ocurrió con la auditoría anterior

Las lecturas se reportaron como read-only, sin actualizaciones. Pero los informes contenían contradicciones aritméticas, totales no conciliados y dos importes distintos para una misma deuda dentro del informe. **No utilizar sus cifras como valores de corrección.**

También se confundieron fórmulas residuales en los scripts. Se detuvieron las repeticiones automáticas. No copiar scripts de `/tmp` ni depender de ellos; no están en el commit.

No atribuir cambios entre lecturas a un proceso/persona sin evidencia. Un saldo positivo no demuestra deuda ni disponible. No convertir saldos positivos a negativos automáticamente.

Hallazgos de código por confirmar antes de ajustes:
- `current_balance` se actualiza con deltas de movimientos; saldos iniciales y cargos heredados `opening_credit` pueden tener semánticas distintas.
- El endpoint de recálculo observado suma impactos sin saldo inicial: NO usarlo como arreglo automático.
- Canonical debt proviene de obligaciones y pagos aplicados; no de `current_balance`.

## 5. Plan de continuación, en orden

- [ ] P1 Confirmar repositorio/commit y entorno del servidor; identificar destino solicitado (pruebas o producción). No sustituir destino por conveniencia.
- [ ] P2 Releer acuerdos y marcar diferencias entre documento, implementación y decisiones de §3. Sin implementar aún reglas nuevas.
- [ ] P3 Preparar consulta/script reproducible de lectura con validaciones deterministas antes de consultar datos reales: una fila por cuenta, sin joins multiplicadores; probar agregación y sumas con fixtures.
- [ ] P4 Ejecutar UNA lectura consistente sobre destino autorizado: `REPEATABLE READ READ ONLY`, timeout acotado, verificación de modo, rollback; comprobar propietario sin exponer datos ajenos. No imprimir conexión/secretos.
- [ ] P5 Por cuenta: línea, saldo inicial, saldo actual, suma de TODOS los impactos una vez, residual `actual-inicial-impactos`, deuda normal/MSI válida con pagos Posted, disponible. Agregar cada origen antes de unir. Validar totales por código y concordancia con fuente dashboard. Si falla, reportar fallo; no inventar resultado ni repetir auditorías sin corregir prueba.
- [ ] P6 Identificar causa de diferencias. Preparar propuesta de ajustes exactos, efectos sobre histórico/efectivo/deuda y mecanismo reversible. Pedir autorización; sin ella no escribir datos.
- [ ] P7 Tras aprobación específica aplicar corrección acotada con respaldo/rollback y validación independiente. No crear gastos/pagos ficticios.
- [ ] P8 Centralizar cálculos aprobados y conciliar crédito, inversiones y proyecciones por unidades acotadas, solo después de acordar alcance. Revisión UI autenticada pendiente.

## 6. Evidencia de pruebas ya observada

- Backend: `dotnet build code.sln`: 0 advertencias/errores; calculadora: **58 comprobaciones**. Son evidencia anterior, no certificación del servidor nuevo.
- Frontend última corrección: **314 pruebas**, TypeScript sin errores, verificación independiente aprobada; padre 15 pruebas focales aprobadas.
- Browser del dashboard autenticado NO ejecutado: falta sesión disponible. Ver login/401 no verifica dashboard.
- Revisión nativa NO completada: último assessment fue unassessable por selección de untracked pendiente. No hay aprobación nativa; no confundirla con verificación independiente.

Comandos de reproducción:

```bash
dotnet build code.sln
dotnet run --project GastosApp.Dashboard.Tests/GastosApp.Dashboard.Tests.csproj
npm --prefix GastosApp.Web test
cd GastosApp.Web && npx tsc --noEmit --incremental false
```

No cambiar dependencias ni regenerar `tsconfig.tsbuildinfo` para esta reanudación.

## 7. Archivos ajenos deliberadamente excluidos del commit

- `.atl/.skill-registry.cache.json`
- `.atl/skill-registry.md`
- `GastosApp.Web/tsconfig.tsbuildinfo`
- `odd/tasks/investment-institution-options.md`

Pueden seguir modificados en esta computadora. No descartarlos, incluirlos ni afirmar que fueron transferidos al servidor.
