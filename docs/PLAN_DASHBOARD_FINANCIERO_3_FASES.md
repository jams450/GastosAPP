# Plan — Dashboard financiero, presupuestos e histórico anual

> Estado: propuesta ejecutable. Basado en auditoría de código de septiembre de 2026.
> No contiene secretos ni valores de configuración sensibles.

---

## Objetivo

Mejorar la lectura de la situación financiera del usuario con tres entregas:

1. Un dashboard separado en resumen, efectivo, crédito y proyección.
2. Una sección para límites mensuales por categoría o subcategoría, gasto acumulado y alertas.
3. Una vista anual por cuenta con movimientos mensuales, saldo de cierre y visualización de tendencia.

La fuente de verdad serán los movimientos y cuentas existentes; dashboard, presupuestos e informes deben usar los mismos agregados financieros.

---

## Reglas financieras transversales

Estas reglas son prerrequisito de todas las fases:

- Una transferencia no cuenta como ingreso, gasto ni consumo de presupuesto consolidado.
- Una compra con tarjeta de crédito cuenta como gasto y consume presupuesto una sola vez.
- El pago de una tarjeta es una transferencia desde efectivo/banco hacia la cuenta de crédito; no vuelve a contar como gasto.
- El saldo de una cuenta a una fecha es: `saldo inicial + movimientos confirmados hasta la fecha`.
- Un movimiento pendiente o proyectado no se presentará como saldo contable real.
- Los datos ausentes se mostrarán como **No disponible**, nunca como `$0`.
- Los meses sin movimientos no se interpretarán como saldo cero.

## Estado actual verificado

| Área | Disponible | Pendiente |
|---|---|---|
| Resumen mensual | Ingreso, gasto y neto | — |
| Efectivo y crédito | Resúmenes separados y cuentas con datos de saldo/ciclo | Corregir fórmula unificada de crédito disponible |
| Crédito | Límite, gasto del periodo, deuda normal/MSI, corte y pago | La UI y backend usan cálculos distintos para crédito disponible |
| Proyección global | Tendencia, meses proyectados, MSI e histórico de seis meses | No existe proyección exclusiva por cuenta |
| Presupuestos | API CRUD y `GET /api/budgets/status?period=yyyy-MM` | Sin BFF, tipos frontend, ruta ni navegación |
| Alertas | Historial de entregas Telegram y reintento de outbox | Sin superficie web; evaluación manual restringida al usuario Telegram configurado |
| Histórico anual por cuenta | El agregado mensual interno existe en `TransactionQueryService` | No existe endpoint HTTP/BFF para el frontend |

---

# Fase 1 — Dashboard financiero

## Alcance

Reorganizar el dashboard actual en pestañas navegables por URL:

```text
/dashboard?tab=resumen
/dashboard?tab=efectivo
/dashboard?tab=credito
/dashboard?tab=proyeccion
```

No requiere datos nuevos. La proyección seguirá siendo global en esta fase.

## Trabajo técnico

1. Unificar el cálculo de **crédito disponible** en backend y frontend.
   - Definir una única convención de signos.
   - Usar el límite de crédito y el saldo/deuda de cada tarjeta de forma consistente.
   - Cuando `CreditLimit` sea nulo, no mostrar porcentaje de utilización.

2. Reestructurar `GastosApp.Web/app/(app)/dashboard/` en pestañas reutilizando los endpoints BFF actuales:
   - `GET /api/bff/dashboard/overview`
   - `GET /api/bff/dashboard/projection?months=N`

3. Incorporar selector de horizonte para proyección: `3`, `6` y `12` meses.

4. Mantener estados vacíos y versión móvil mediante tarjetas/listas; no comprimir tablas en pantallas pequeñas.

## Contenido por pestaña

### Resumen

- KPIs: ingresos del mes, gastos del mes, neto financiero, efectivo disponible y crédito disponible.
- Gráfica de gasto por categoría.
- Barras de ingresos vs gastos vs neto.
- Cuentas con mayor movimiento del periodo.

### Efectivo

- KPIs: saldo total no-crédito, ingresos, gastos y neto mensual.
- Barras por cuenta: ingresos vs gastos.
- Tarjetas con saldo de cierre y variación mensual.

### Crédito

- KPIs: crédito disponible, deuda normal pendiente, deuda MSI pendiente y gasto normal/MSI del mes.
- Barra de utilización por tarjeta.
- Fechas de corte y pago.
- Lista compacta de planes MSI: cuotas restantes, próximo pago y fin estimado.

### Proyección

- KPIs: saldo real de efectivo, neto mensual proyectado y compromiso MSI.
- Línea histórica y línea punteada para el escenario proyectado.
- Barras del neto histórico mensual.
- Si `HasSufficientHistory` es falso, no dibujar una tendencia ficticia; explicar que falta historial.

## Criterios de aceptación

- [ ] Crédito disponible muestra el mismo resultado en todas las tarjetas y KPIs.
- [ ] Efectivo, crédito y resumen coinciden con los datos de cuentas/movimientos.
- [ ] La proyección se diferencia visualmente del saldo real.
- [ ] Los estados sin datos no muestran ceros engañosos.
- [ ] Las cuatro pestañas son utilizables en móvil.

---

# Fase 2 — Límites, gasto y alertas

## Alcance

Crear una sección propia para presupuestos mensuales. No añadirla como otra sección plegable del dashboard.

```text
/budgets
/budgets?tab=alertas
```

Añadir `Presupuestos` a `GastosApp.Web/components/navigation/nav-config.ts`.

## Datos ya disponibles

- Presupuestos por categoría **o** subcategoría, nunca ambos al mismo tiempo.
- Periodo explícito `yyyy-MM`, sin rollover.
- Importe presupuestado, gasto, restante, porcentaje usado, estado y umbrales.
- Historial de alertas Telegram y outbox para reintentos.

## Trabajo técnico

1. Revisar y confirmar `BudgetService.GetSpentAsync` antes de exponer la UI como definitiva:
   - compras a crédito cuentan una vez;
   - pago de tarjeta no cuenta doble;
   - transferencias siguen excluidas;
   - definir tratamiento de devoluciones, asignaciones cobrables y pendientes.

2. Crear BFF autenticado:

```text
/api/bff/budgets/*
/api/bff/alerts/*
```

3. Crear contratos TypeScript de presupuestos, umbrales, estado y entregas de alertas.

4. Crear la interfaz de presupuestos y reutilizar el patrón de drawer de cuentas para crear/editar/activar/desactivar límites.

## `/budgets` — Límites del mes

- Selector de periodo mensual.
- KPIs: total presupuestado, total gastado y total restante.
- Lista o grilla por presupuesto con:
  - categoría o subcategoría;
  - importe gastado, límite y restante;
  - porcentaje usado;
  - barra de progreso;
  - estado `ok`, `warning` o `exceeded`;
  - umbrales alcanzados.
- En móvil: una tarjeta por presupuesto.
- Estado vacío con CTA para crear el primer límite.

## `/budgets?tab=alertas`

- Historial por periodo: presupuesto, umbral, porcentaje al dispararse, gasto, fecha y estado de entrega.
- Reintento únicamente para entregas fallidas.
- No mostrar payloads de outbox.
- No añadir botón de evaluación manual: el endpoint actual está restringido al usuario Telegram configurado.

## Fuera de alcance

- Rollover de saldo mensual.
- Presupuestos anuales o sobres virtuales.
- Alertas in-app o campanita.
- Comparativa histórica de presupuestos.
- Métrica de ritmo diario; requiere exponer agregados por día en una fase posterior.

## Criterios de aceptación

- [ ] El gasto mostrado por presupuesto coincide con los movimientos del periodo.
- [ ] Transferencias y pagos de tarjeta no inflan el gasto presupuestario.
- [ ] Una compra a crédito consume el presupuesto una vez.
- [ ] Estado, porcentaje, restante y umbrales se presentan correctamente.
- [ ] Las alertas no exponen información sensible ni prometen entrega en tiempo real.

---

# Fase 3 — Histórico anual por cuenta

## Alcance

Añadir detalle anual dentro del contexto de cada cuenta:

```text
/accounts/[id]?tab=resumen
/accounts/[id]?tab=mensual&year=2026
/accounts/[id]?tab=credito
```

La pestaña `credito` solo aparece para cuentas de crédito.

## Dato faltante

No existe endpoint HTTP para una serie mensual anual por cuenta. No usar doce llamadas desde el frontend: añade latencia y puede producir totales inconsistentes.

## Trabajo backend

1. Exponer un agregado mensual reutilizando `TransactionQueryService.QueryAcrossAccountsForUserAsync`.

```text
GET /api/accounts/{accountId}/annual-summary?year=2026
```

2. Crear BFF y contrato TypeScript correspondientes.

3. Respuesta mínima propuesta:

```json
{
  "year": 2026,
  "openingBalance": 0,
  "months": [
    {
      "month": 1,
      "income": 5000,
      "expense": 3000,
      "netTransfers": 0,
      "closingBalance": 6000
    }
  ],
  "yearIncome": 0,
  "yearExpense": 0,
  "yearNetTransfers": 0,
  "closingBalance": 0
}
```

4. El agregado debe cumplir:

```text
saldo final =
saldo inicial
+ ingresos
+ gastos
+ transferencias netas
```

Las transferencias deben informarse en `netTransfers`, pero no como ingreso ni gasto.

## Trabajo frontend

### Pestaña Mensual

- Selector de año; por defecto, el año actual.
- Barras de ingresos vs gastos de enero a diciembre.
- Línea de saldo final mensual.
- Tabla en escritorio y tarjetas en móvil con el detalle mensual.
- KPIs anuales: saldo inicial, ingresos, gastos, transferencias netas y saldo final.

### Pestaña Crédito

- Uso de línea de crédito.
- Fechas de corte/pago.
- MSI y cargos pendientes.

## Proyección por cuenta

No existe y no debe simularse con datos globales.

- Cuentas de efectivo: no mostrar una proyección exclusiva hasta tener cálculo por cuenta.
- Cuentas de crédito: mostrar cargos y MSI pendientes.
- Si se presenta una proyección global desde esta vista, debe etiquetarse explícitamente como **global**, no de la cuenta seleccionada.

## Fuera de alcance

- Predicción con IA o proyección estadística por cuenta.
- Multimoneda y conversión.
- Conciliación bancaria automática.
- Caché o vistas materializadas sin evidencia de problemas de rendimiento.

## Criterios de aceptación

- [ ] El filtro de año y cuenta no mezcla datos de otras cuentas.
- [ ] El saldo anual cuadra con movimientos confirmados y saldo inicial.
- [ ] Transferencias no alteran totales de ingreso/gasto.
- [ ] Un mes sin movimientos no se dibuja como saldo cero.
- [ ] Las visualizaciones distinguen saldo real, movimientos y proyección.

---

## Orden de ejecución

1. Fase 1: corregir crédito disponible y reorganizar el dashboard.
2. Fase 2: validar cálculo de gasto presupuestario, después BFF e interfaz de límites/alertas.
3. Fase 3: endpoint agregado anual, BFF, contratos y pantalla por cuenta.

## Decisión de menor esfuerzo

Si se requiere valor inmediato con la menor cantidad de backend nuevo, iniciar por la interfaz de **Fase 2 — Presupuestos**: los servicios y API principales ya existen.
