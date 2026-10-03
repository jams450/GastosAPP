# Plan técnico — Inversión de renta fija MX (V1)

**Estado:** V1 implementada, integrada en `main` y **CERRADA**.
**Cierre:** 2026-10-03, con validación funcional completa y satisfactoria reportada por el usuario.
**Ámbito:** GastosApp (API .NET 9, PostgreSQL, frontend Next.js/App Router).
**Moneda:** MXN. **Zona horaria operativa:** `America/Mexico_City`.

Este documento sustituye la propuesta inicial por el alcance final implementado. La comparación de ofertas y los escenarios independientes quedan para V2; no son pendientes de aceptación de V1. Referencia técnica: [INVERSION_RENTA_FIJA_V1.md](INVERSION_RENTA_FIJA_V1.md).

> **Advertencia funcional:** los resultados son proyecciones de planeación, no ingresos reales, rendimiento garantizado, asesoría financiera ni instrucciones de compra. Las tasas y condiciones comerciales se capturan manualmente desde sus fuentes; deben verificarse producto por producto y mes por mes. La aplicación no inventa tasas ni verifica que una condición comercial se cumpla.

## 1. Objetivo y límites finales

Permitir al administrador mantener un catálogo propio de productos y ofertas mensuales, vincular opcionalmente cuentas elegibles y generar un plan mensual con los saldos existentes, asignaciones, exclusiones y proyección auditable.

| Incluido en V1 | Regla final |
|---|---|
| Catálogo de productos y ofertas | Un producto puede existir sin cuenta y vincularse después. |
| Capital de proyección | Se lee `Account.CurrentBalance` al generar y se congela en el snapshot. No se introduce dinero manualmente. |
| Asignaciones | Cada producto elegible usa el saldo de su cuenta vinculada; no se redistribuye dinero entre instituciones ni se optimiza una cartera. |
| Plan mensual | Un plan por usuario y mes; regenerar el mismo mes sustituye su contenido. |
| Proyección | Horizonte de 1 a 24 meses, capitalización mensual y límites de vigencia explícitos. |
| Integración con presupuestos | Rendimiento esperado como supuesto separado, nunca como transacción o ingreso real. |
| Acceso | Página, API y BFF administrativos; datos acotados al usuario autenticado. |

Fuera de V1: operar o transferir dinero, banca abierta, alterar saldos o transacciones, aportaciones futuras, capital manual, inventar tasas, recomendaciones de compra, optimización, señales de liquidez/MSI, comparación e inversión independiente de cuentas. No existe versionado completo de cada generación de un mismo mes.

## 2. Catálogo y vínculo de cuenta

### Instituciones controladas

| Código | Institución |
|---|---|
| `revolut` | Revolut |
| `cetes` | CETES |
| `nu` | Nu |
| `klar` | Klar |
| `finsus` | Finsus |
| `didi` | DiDi |
| `mercado_libre` | Mercado Libre |

Los códigos se normalizan y validan en dominio, servicio, restricción SQL y selector frontend. No se admite una institución arbitraria ni se precargan tasas comerciales.

### Vínculo opcional y exclusivo

- Un producto tiene cero o una cuenta vinculada. Sin cuenta sigue siendo útil para capturar ofertas, pero no recibe una asignación de saldo.
- Una cuenta elegible pertenece al usuario, está activa, no es de crédito (`!IsCredit`) y genera intereses (`EarnsInterest`). Su tasa anual de metadatos no sustituye una oferta capturada.
- Sólo puede existir un producto activo vinculado a una misma cuenta del usuario. La exclusividad también está protegida por `ux_investment_products_active_account`.
- Vincular, cambiar o quitar el vínculo mediante el PATCH acotado conserva ofertas, IDs de tramos, confirmaciones y snapshots históricos. Desvincular envía `accountId: null`.
- Reactivar un producto vinculado vuelve a comprobar elegibilidad y ocupación. Un producto sin cuenta puede activarse para uso de catálogo.
- Una edición de catálogo con ofertas normalizadas sin cambios conserva sus IDs. Cambiar el contenido de una oferta sustituye sus tramos y exige nuevas confirmaciones para los nuevos IDs.

## 3. Captura mensual, vigencia y tramos

Cada oferta pertenece a un producto y a un `capturedForMonth` (`yyyy-MM`) único. Se registra fuente HTTPS, inicio de vigencia, confirmación de condiciones y tramos explícitos.

- `validFrom` es obligatorio. Si falta `validTo`, se infiere el 31 de diciembre del año de captura y se marca `validityInferred`; no se infiere ninguna tasa.
- La vigencia final no puede preceder al inicio. Para generar, la oferta debe corresponder exactamente al mes solicitado y cubrir su primer día.
- Una oferta anterior nunca se promociona automáticamente al mes actual aunque su fecha final lo abarque.
- Los tramos marginales usan rangos `[min, max)`, comienzan en cero y son contiguos, sin huecos ni solapamientos. Sólo el último puede carecer de límite superior.
- Cada porción del saldo usa su tasa; la tasa superior no se aplica al saldo completo. El exceso sobre un último tramo finito no genera interés.
- `specialConditionText` conserva literalmente la condición comercial. Una tasa condicionada requiere confirmación explícita de ese tramo; las confirmaciones se guardan en el snapshot. No se introduce una tasa alternativa inventada.

## 4. Elegibilidad, asignaciones y exclusiones

La generación evalúa productos del usuario y separa elegibles de excluidos. Para asignar saldo, exige producto activo, institución permitida, cuenta propia elegible, oferta del mes vigente, confirmación general, tramos válidos y confirmaciones de cada condición especial requerida.

| Exclusión | Significado |
|---|---|
| `unlinked_account` | Producto de catálogo sin cuenta. |
| `missing_account`, `foreign_account` | Cuenta inexistente/no disponible o ajena. |
| `inactive_account`, `credit_account`, `non_interest_account` | Cuenta no elegible. |
| `inactive_product`, `unsupported_institution` | Producto inactivo o institución no admitida. |
| `no_offer_for_month`, `offer_not_captured_for_month` | No existe captura utilizable para ese mes. |
| `validity_not_covering_month` | La vigencia no cubre el inicio del mes. |
| `conditions_not_confirmed` | Falta confirmación general o de un tramo condicionado. |
| `invalid_or_missing_tiers` | Tramos ausentes o inválidos. |

Se genera con los productos elegibles y se devuelve la lista de exclusiones. Sólo la ausencia total de productos elegibles impide generar (`400` con detalle de exclusiones). No se rechaza todo el plan por una exclusión parcial.

## 5. Plan, borrador y snapshots

### Consulta y herencia

`GET /api/investments/plans/current?planMonth=` devuelve primero el plan persistido del mes. Si no existe, construye un borrador de respuesta desde el plan anterior más cercano o, en ausencia de éste, desde el catálogo. Sin plan previo ni productos devuelve `404`.

El borrador no se guarda (`isPersisted: false`, `investmentPlanId: 0`), no copia saldos del plan anterior ni crea ofertas mensuales. Mantiene visibles productos, exclusiones y condiciones pendientes; las confirmaciones anteriores no se heredan como aprobación. El usuario debe capturar y validar el mes nuevo antes de generar.

### Generación y conservación

- Mes operativo actual por defecto en `America/Mexico_City`; `planMonth` explícito admite `yyyy-MM` válido.
- Una fila por `(UserId, PlanMonth)`. La regeneración conserva el ID del plan y sustituye asignaciones/exclusiones de ese mes, sin guardar todas sus versiones.
- Las asignaciones congelan saldo leído, producto/cuenta, oferta, fuente, vigencia, indicador de vigencia inferida, tramos y confirmaciones utilizados.
- La proyección posterior utiliza el snapshot, no el saldo vivo ni una oferta editada después. Los planes de otros meses permanecen independientes.
- Todos los flujos de inversión son de sólo lectura respecto del dinero: no crean ingresos/gastos ni modifican `Account.CurrentBalance`, transacciones, créditos, MSI o cuotas.

## 6. Cálculo y presentación de proyección

El motor puro usa `decimal`, aplica tasas anuales capturadas divididas entre 12, redondeo monetario y capitalización mensual. No incorpora aportaciones, impuestos, inflación, transferencias ni supuestos de tasas nuevas.

Para cada mes del horizonte de 1 a 24 se expone saldo inicial, interés estimado y saldo final. Al dejar de cubrir la vigencia el inicio de un mes, éste y los siguientes quedan sin valores proyectables, con advertencia explícita; no se rellenan con ceros que aparenten rendimiento conocido.

### Interfaz en español

- Catálogo en tarjetas plegables, con creación/edición, activación y vínculo opcional; mensajes diferenciados para errores, carga y datos vacíos.
- Selectores de cuentas filtran elegibilidad y ocupación, permiten no vincular y muestran un vínculo que dejó de ser elegible para poder corregirlo.
- Dashboard con KPI de capital inicial congelado, rendimiento del primer mes, año calendario del plan y horizonte exacto de 12 meses.
- El KPI de 12 meses sólo muestra total cuando existen exactamente 12 meses calculables por asignación. Las series incompletas y el año calendario parcial se señalan, sin sustituir el total de 12 meses por un subtotal.
- Gráfica de trayectoria inicio→fin: incluye capital inicial como punto de partida y continuidad de saldos finales calculables.
- Tabla mensual, detalle por producto, exclusiones y advertencias de proyección; avisos cuando cambiaron ofertas/condiciones respecto del snapshot y se requiere regenerar.

## 7. Arquitectura y contratos implementados

| Capa | Responsabilidad / ubicación |
|---|---|
| Modelos y persistencia | `InvestmentProduct`, `InvestmentOffer`, `InvestmentRateTier`, `InvestmentPlan`, `InvestmentAllocation`; snapshots JSONB y exclusiones. |
| EF/PostgreSQL | `ContextSqlGastos`, `SQL/schema.sql` y migraciones de inversión existentes; restricciones de catálogo, vigencia y exclusividad. |
| Dominio y cálculo | `GastosApp.BusinessLogic/Services/Investments/InvestmentCalculator.cs`; elegibilidad, tramos y proyección. |
| Aplicación | `GastosApp.BusinessLogic/Services/Investments/InvestmentService.cs`; captura, vínculos, borrador, generación y lectura de snapshot. |
| API | `GastosApp.API/Controllers/InvestmentsController.cs`; DTOs explícitos y `ICurrentUserService`. |
| BFF y contratos | `GastosApp.Web/app/api/bff/investments/`, `GastosApp.Web/lib/contracts/investments.ts`. |
| Página administrativa | `GastosApp.Web/app/(app)/investments/`; dashboard, catálogo y tabla. |
| Presupuestos | Ruta BFF `investments/expected-income`, contrato y hook de ingresos previstos. |

Todos los endpoints de inversión usan `AdminWithId`; el usuario no se acepta como parámetro de identidad. Un ID ajeno se trata como inexistente. No se serializan entidades EF ni sus grafos de navegación. BFF mantiene sesión autenticada y página restringe acceso administrativo.

| Método / ruta API | Función |
|---|---|
| `GET /api/investments/products` y `GET /api/investments/products/{id}` | Catálogo propio y detalle. |
| `POST /api/investments/products` | Crear producto/ofertas. |
| `PUT /api/investments/products/{id}` | Actualizar catálogo y vínculo opcional. |
| `PATCH /api/investments/products/{id}/account` | Vincular, desvincular o cambiar cuenta sin sustituir ofertas. |
| `PATCH /api/investments/products/{id}/active` | Activar/desactivar. |
| `GET /api/investments/plans/current?planMonth=` | Plan del mes o borrador derivado. |
| `GET /api/investments/plans/{id}` | Snapshot, asignaciones y exclusiones. |
| `GET /api/investments/plans/{id}/projection` | Serie calculada desde snapshot. |
| `POST /api/investments/plans` | Generar o sustituir el plan mensual. |

## 8. Rendimiento esperado en presupuestos

`GET /api/bff/investments/expected-income?period=yyyy-MM` consulta `plans/current?planMonth=` para ese periodo y después la proyección del plan persistido. Suma `Interest` de las filas calculables del mes pedido; no utiliza un endpoint API de ingresos esperados independiente ni crea ingresos reales.

- Sin plan (`404`), acceso al módulo no administrativo (`403`), borrador no persistido o proyección desaparecida (`404`): respuesta normal con `expectedInterest: 0`, `allocationCount: 0`, `hasPlan: false`.
- Con plan y proyección utilizables: `hasPlan: true`, interés esperado y número de asignaciones calculables del periodo. La suma excluye filas no calculables; no implica que todas las asignaciones tengan una proyección completa.
- Otros fallos de consulta y respuestas malformadas se muestran como errores, no se convierten silenciosamente en una ausencia de plan.
- Presupuestos separa ingresos reales, manuales y rendimiento de inversión previsto como supuesto de planeación. Consultar esta integración no genera un plan, no modifica un presupuesto ni registra movimientos.

## 9. Fases y checklist de cierre

| Fase | Entrega confirmada | Estado |
|---|---|---|
| 1. Dominio y persistencia | Catálogo, vínculo opcional exclusivo, ofertas/tramos y snapshots. | Completada |
| 2. Motor y aplicación | Elegibilidad, exclusiones, cálculo, borrador y regeneración mensual. | Completada |
| 3. API y seguridad | DTOs, aislamiento de usuario y acceso administrativo. | Completada |
| 4. Frontend y BFF | Catálogo plegable, vínculos, dashboard, gráfica, KPI y tabla mensual. | Completada |
| 5. Integración | Rendimiento esperado en presupuestos, separado del dinero real. | Completada |
| 6. Validación y cierre | Usuario reporta pruebas completas satisfactorias y funcionamiento correcto. | **CERRADA — 2026-10-03** |

### Criterios finales de aceptación

- [x] Siete instituciones controladas; captura mensual con fuente, vigencia y tasas explícitas.
- [x] Catálogo sin cuenta permitido; cuenta vinculada propia, activa, no crediticia y con intereses.
- [x] Exclusividad de vínculo activo y conservación de ofertas/confirmaciones al cambiar vínculo.
- [x] Tramos marginales contiguos y confirmación por condición especial.
- [x] Asignación desde saldo leído, exclusiones explicables y ausencia de mutaciones monetarias.
- [x] Borrador sólo en respuesta, validación mensual y reemplazo del plan del mismo mes.
- [x] Proyección de 1–24 meses desde snapshot con vigencia e incertidumbre visibles.
- [x] UI administrativa en español con capital congelado, KPI, gráfica y tabla mensual.
- [x] Presupuestos consume rendimiento previsto sin crear ingresos reales.
- [x] Implementación integrada en `main`; validación funcional completa confirmada por el usuario.

Las entregas se documentan a partir del alcance implementado. La última casilla de validación representa el reporte del usuario, no una ejecución de pruebas realizada por el asistente durante esta actualización.

## 10. Evidencia de verificación y alcance del cierre

**Evidencia automatizada previa documentada:** la nota técnica `INVERSION_RENTA_FIJA_V1.md` registra pruebas del motor puro, del ciclo EF en memoria y del frontend (contratos, KPI y flujo de catálogo). Esa evidencia corresponde a verificaciones anteriores; no certifica por sí sola una ejecución nueva sobre el HEAD actual ni sustituye pruebas con PostgreSQL real.

**Validación funcional de cierre:** el usuario informa que realizó las pruebas completas, que terminaron satisfactoriamente y que el módulo funciona correctamente. Sobre esa confirmación se cierra V1 el **2026-10-03**. No se atribuyen al asistente ejecuciones, cantidades de pruebas, comandos, resultados de base de datos ni bitácoras que no fueron observados.

**Esta actualización:** exclusivamente documental. La revisión del repositorio primario y de los contratos permite reconciliar el plan con el alcance vigente. La verificación aplicable es revisar el documento, su diff y `git diff --check`; no requiere ejecutar suites ni modificar servicios. No supone commit, merge, push, ejecución de migraciones ni acción sobre bases de datos.

## 11. Seguimiento V2 — no bloqueante

- Comparación de productos/ofertas y escenarios independientes de las cuentas, con reglas propias antes de incorporar optimización o capital hipotético.
- Historial completo de generaciones si se necesita conservar versiones del mismo mes.
- Automatización adicional de integración PostgreSQL y E2E como mejora continua, no como reapertura del cierre funcional reportado.

No hay tareas de V1 abiertas en este plan. Cualquier ampliación requiere alcance y criterios de aceptación propios.

## Aprendizajes clave

- Catálogo, cuenta y oferta mensual son conceptos distintos: capturar una oferta no obliga a asignarle dinero.
- Snapshot de saldo y oferta evita reinterpretar un plan histórico con datos vivos; regenerar el mismo mes es reemplazo, no versionado.
- Validación del usuario y evidencia automatizada previa deben conservar su procedencia; cerrar un plan no autoriza inventar ejecuciones ni realizar despliegues.
