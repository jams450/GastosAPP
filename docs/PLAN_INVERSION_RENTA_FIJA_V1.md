# Plan técnico — Planificación de inversión de renta fija MX (V1)

**Estado:** propuesta de implementación  
**Ámbito:** GastosApp (API .NET 9, PostgreSQL, frontend Next.js 15/App Router)  
**Moneda:** MXN  
**Zona horaria operativa:** `America/Mexico_City`

> **Advertencia funcional:** esta V1 es una herramienta de planeación con datos capturados y verificados manualmente por la persona usuaria. Sus importes, proyecciones y recomendaciones son escenarios, no asesoría financiera, promesa de rendimiento ni instrucción de compra. Las tasas vigentes se capturan desde fuentes oficiales en la interfaz; este plan no inventa, precarga ni publica tasas.

## 1. Objetivo y límites

### Objetivo

Permitir que cada usuario, una vez por mes, capture y audite ofertas de renta fija disponibles en México y genere un **plan básico optimizado** para un capital inicial y una aportación mensual **supuestos**. El resultado debe:

- comparar los tramos de tasa vigentes de los productos registrados;
- respetar mínimo, máximo y condiciones declaradas de cada tramo;
- mostrar la fuente, fecha de consulta y vigencia de los datos usados;
- proyectar el capital y el rendimiento estimado por mes;
- mostrar, de forma opcional y exclusivamente conceptual, la liquidez frente a cuentas existentes y cuotas MSI abiertas;
- conservar el resultado y sus entradas para que pueda auditarse posteriormente.

El catálogo controlado de instituciones de V1 es: **Revolut, CETES, Nu, Klar, Finsus, DiDi y Mercado Libre**. Cada institución puede tener uno o más productos ingresados manualmente.

### No objetivos de V1

| Fuera de alcance | Motivo / límite explícito |
|---|---|
| Consultar, abrir, operar o transferir dinero hacia instituciones | La aplicación no será intermediaria financiera ni integrará banca abierta. |
| Crear transacciones, transferencias, ingresos, gastos o modificar saldos de `Account` | El plan trabaja con supuestos; una vinculación a cuenta es de lectura conceptual. |
| Usar ingresos reales como aportación | La aportación y el saldo inicial se etiquetan como supuestos ingresados por el usuario. |
| Scraping, extracción automatizada o agregación comercial de tasas | V1 requiere captura manual, fuente auditable y fecha/vigencia verificables. |
| Conector Banxico SIE | Se deja como evolución futura, sólo para CETES. No se almacenarán tokens ni secretos. |
| Modelar préstamo, deuda revolvente, CAT, pago mínimo o recomendaciones de crédito | No existen datos suficientes de CAT, pago mínimo ni saldo revolvente para una recomendación responsable. |
| Simular impuestos, inflación, comisiones, penalizaciones por salida, riesgo de crédito, disponibilidad intradía o cobertura | Se mostrarán como límites de la estimación; no se inferirán. |
| Optimización multiobjetivo, perfiles de riesgo o rebalanceo automático | La V1 ordena rendimiento nominal estimado bajo restricciones declaradas. |

## 2. Hechos verificados del repositorio que condicionan el diseño

| Hecho | Evidencia y consecuencia |
|---|---|
| API .NET con usuarios aislados por JWT | Los controladores usan `[Authorize(Policy = "UserWithId")]`, `ICurrentUserService` y una identidad validada contra usuario/sesión vigente. Toda consulta y mutación de inversión debe derivar `userId` del token, nunca del DTO o la ruta. |
| Frontend Next.js App Router con BFF | Las rutas `app/api/bff/*` obtienen la sesión del servidor y reenvían el JWT a la API. La nueva UI debe usar el mismo BFF, no exponer ni llamar credenciales desde el navegador. |
| Dashboard existente | `DashboardService` ya calcula proyección y expone compromisos MSI; el frontend usa dashboard, contratos y Recharts 3.x. La inversión debe ser un módulo independiente, no alterar la semántica del dashboard financiero actual. |
| MSI disponible | El backend conoce `CreditInstallment`, su fecha de vencimiento e importe pendiente. Sólo se reutilizará como señal de compromiso de liquidez de lectura. |
| `Account` tiene tasa plana | `Account.EarnsInterest` y `Account.AnnualInterestRate` existen, pero sólo modelan una tasa única de cuenta y no representan productos, tramos, fuentes, vigencias ni condiciones. No se reutilizarán como catálogo de inversión. |
| Persistencia PostgreSQL mediante EF Core y SQL versionado | `ContextSqlGastos` mapea entidades; los despliegues existentes usan `SQL/migrations/*.sql` idempotentes y `SQL/schema.sql` para instalaciones nuevas. La migración V1 debe actualizar ambos. |
| Auditoría base | Las entidades que heredan `BaseModel` reciben campos `created_*`/`updated_*` al guardar. Las nuevas entidades lo usarán. |

## 3. Decisiones de arquitectura

1. **Módulo separado de cuentas y transacciones.** El dominio de inversión vive en nuevas entidades, servicios, controlador y BFF. No se añade lógica de inversión a `AccountService` ni se recalcula `CurrentBalance`.
2. **Ofertas y fuentes por usuario.** Las tasas comerciales pueden ser personalizadas, estar sujetas a campañas o condiciones y cambian con frecuencia. Por ello cada usuario captura sus propias ofertas auditables; no habrá una tabla global con tasas compartidas ni tasas de ejemplo.
3. **Un plan editable por mes, con snapshots.** Existe a lo más un plan por usuario y mes. Al iniciar un mes nuevo, el sistema hereda del mes anterior los supuestos, las ofertas y las confirmaciones como borrador, pero la generación exige que la información se actualice: cada oferta debe tener captura y vigencia verificadas dentro del mes del plan. Cada generación guarda las asignaciones, la oferta/tramo usado y una copia mínima de sus términos; editar una oferta después no reescribe un plan ya generado.
4. **Optimización determinista y explicable, sin IA en V1.** Se asigna capital a capacidad elegible ordenada por la tasa marginal ponderada esperada; los empates se resuelven por prioridad explícita del usuario y después por identificador estable. No se oculta una heurística ni se ejecuta IA. V1 entrega un ranking y un escenario auditables, no una recomendación personalizada. Una recomendación asistida por IA queda fuera de V1 y se evaluará en V2, restringida a herramientas específicas que sólo puedan leer y calcular sobre los datos declarados (tramos, condiciones confirmadas, supuestos y compromisos MSI); nunca podrá inventar tasas, productos ni condiciones.
5. **Tramos marginales por defecto.** Cada tramo se aplica sólo a la parte del saldo que cae dentro de su intervalo; no a todo el saldo. Por ejemplo, para $200,000 con `[0, 25,000)` al 15% y `[25,000, ∞)` al 7%, se calculan $25,000 al 15% y $175,000 al 7%. La fuente debe poder declarar explícitamente un modo distinto en una evolución futura, pero V1 no lo infiere.
6. **Condiciones no automatizables requieren confirmación explícita.** Texto como “gasto mínimo”, “compras” o “mantener saldo” se conserva literal. Si un tramo tiene condición especial, no es elegible hasta que el usuario marque que la cumple para ese plan; la aplicación no pretende verificarla.
7. **Ofertas expiradas bloquean la optimización.** Datos sin fuente, fecha de captura o vigencia válida permanecen visibles como históricos, pero no pueden participar en una nueva recomendación. Cuando la fuente no publique una fecha de vigencia, la interfaz asigna como `ValidUntil` el 31 de diciembre del año de `CapturedOn`; el dato queda marcado como vigencia inferida y debe recapturarse para el siguiente año.
8. **MSI es una advertencia de liquidez, no deuda simulada.** La lectura usa cuotas abiertas existentes por mes, sin crear planes de crédito, sin registrar pagos ni sugerir financiación.

## 4. Modelo de datos propuesto

Los importes monetarios se almacenan como `decimal(15,2)`. Porcentajes como `decimal(7,4)` expresan porcentaje anual (por ejemplo, un valor porcentual introducido por el usuario, sin predeterminados). Fechas de negocio se modelan como `date`/`DateOnly`; auditoría conserva el patrón existente de marcas temporales UTC.

### 4.1 Entidades

| Entidad | Campos principales | Reglas e índices |
|---|---|---|
| `InvestmentProduct` / `investment_products` | `InvestmentProductId`, `UserId`, `InstitutionCode`, `Name`, `Active` | `InstitutionCode` restringido a `revolut`, `cetes`, `nu`, `klar`, `finsus`, `didi`, `mercado_libre`. Nombre máximo 120. Índice único `(user_id, institution_code, normalized_name)`. La institución se controla mediante enum/constantes del dominio, no texto libre. |
| `InvestmentOffer` / `investment_offers` | `InvestmentOfferId`, `ProductId`, `SourceUrl`, `SourceLabel`, `CapturedOn`, `ValidFrom`, `ValidUntil`, `ValidityInferred`, `TermsText`, `Active` | URL HTTPS de máximo 2,000 caracteres y etiqueta de fuente máximo 160. `CapturedOn` obligatorio; `ValidFrom <= ValidUntil` si ambos existen. Si la fuente no publica vigencia, el servidor establece `ValidUntil` al 31 de diciembre del año de `CapturedOn` y `ValidityInferred = true`. Para optimizar: activa, fuente no vacía, `CapturedOn <= fecha del plan` y `ValidUntil >= fecha del plan`. Índice `(product_id, active, valid_until)`. |
| `InvestmentOfferTier` / `investment_offer_tiers` | `InvestmentOfferTierId`, `OfferId`, `MinAmountMxn`, `MaxAmountMxn?`, `AnnualRatePercent`, `SpecialConditionText?`, `Priority` | `MinAmountMxn >= 0`; `MaxAmountMxn IS NULL OR MaxAmountMxn > MinAmountMxn`; tasa `> 0 AND <= 100`; condición máximo 1,000. `Priority >= 0`. Índice `(offer_id, priority)`. Validación de servicio: tramos de una oferta no se solapan; rangos se interpretan como `[min, max)`, y `max = NULL` como sin límite superior. |
| `InvestmentPlan` / `investment_plans` | `InvestmentPlanId`, `UserId`, `PlanMonth`, `AssumedStartingAmountMxn`, `AssumedMonthlyContributionMxn`, `ProjectionMonths`, `LinkedAccountId?`, `Status`, `GeneratedAt`, `SourcePlanId?`, `AssumptionsNote?` | `PlanMonth` es primer día del mes y `(user_id, plan_month)` es único en V1. Ambos supuestos `>= 0`, y al menos uno debe ser `> 0`; horizonte entre 1 y 24. Efectivo al mes de Ciudad de México. `SourcePlanId` referencia el plan del mes anterior del que se heredó el borrador, con `ON DELETE SET NULL`; es trazabilidad, no dependencia funcional. `LinkedAccountId` FK nullable a `accounts`, `ON DELETE SET NULL`; el servicio exige cuenta activa, no crédito y del mismo usuario. Índices `(user_id, plan_month DESC)` y `(linked_account_id)`. |
| `InvestmentPlanConditionConfirmation` / `investment_plan_condition_confirmations` | `PlanId`, `TierId`, `Confirmed`, `ConfirmedAt` | PK compuesta `(plan_id, tier_id)`. Sólo se permite confirmar un tramo perteneciente a una oferta disponible para el plan. Sirve como atestación manual, no prueba externa. |
| `InvestmentPlanAllocation` / `investment_plan_allocations` | `AllocationId`, `PlanId`, `TierId?`, `ProductNameSnapshot`, `InstitutionCodeSnapshot`, `AnnualRatePercentSnapshot`, `AllocatedAmountMxn`, `TermsSnapshot`, `SourceUrlSnapshot`, `SourceCapturedOnSnapshot` | Al generar, se copia la trazabilidad indispensable. Importe `> 0`; tasa snapshot `> 0`; URL/fuente de snapshot obligatorias. Índices `(plan_id)` y `(tier_id)`. `TierId` puede ser nullable sólo si una futura política de archivado de catálogo lo exige; V1 debe preferir `RESTRICT` sobre borrar tramos ya usados. |

Todas heredan `BaseModel`. Los nombres normalizados se calculan en el servidor, no se aceptan como autoridad desde el cliente.

### 4.2 Integridad y DDL

- La migración debe ser transaccional, idempotente y ordenada: productos → ofertas → tramos → planes → confirmaciones → asignaciones.
- Las FK de usuario y producto usan `ON DELETE CASCADE` para datos privados no referenciados por historial; las referencias de asignaciones a tramos se protegen con `RESTRICT` para no romper trazabilidad.
- PostgreSQL no puede expresar por sí solo que un `LinkedAccountId` pertenece al mismo `UserId` de `InvestmentPlan`; se valida en todas las operaciones de escritura y lectura sensible mediante consulta user-scoped. No se confiará en la FK simple como control de pertenencia.
- La no superposición de rangos se valida en el servicio en V1. Si después se necesitan garantías ante escrituras externas, se evaluará una exclusión PostgreSQL con rango numérico, pero no se añade complejidad sin un escritor alterno.
- Añadir en `SQL/schema.sql` las tablas, restricciones e índices equivalentes para bases nuevas, y una migración nueva en `SQL/migrations/` para bases existentes. No se deben ejecutar migraciones automáticamente desde la API.

## 5. Cálculo de tramos, optimización y proyección

### 5.1 Elegibilidad de oferta y tramo

Para un plan mensual `P` en fecha `d`:

1. Seleccionar ofertas activas del usuario con producto activo, fuente HTTPS, fecha de captura y vigencia válida en `d`.
2. Excluir ofertas vencidas, futuras, sin fuente o sin fecha suficiente para comprobarlas.
3. Para cada tramo, si tiene `SpecialConditionText`, exigir una confirmación positiva en `InvestmentPlanConditionConfirmation` para `P`.
4. Para una oferta escalonada, calcular cada porción marginal sobre el saldo total asignado a esa oferta: `portion = min(saldoOferta, MaxAmountMxn) - MinAmountMxn`, acotada inferiormente a cero; si `MaxAmountMxn` es `NULL`, la porción es `max(0, saldoOferta - MinAmountMxn)`.

Los límites se interpretan como `[min, max)`; `max = NULL` no tiene límite superior. En V1, los tramos son **marginales**: cada porcentaje sólo rige la porción de saldo dentro de su intervalo. Ejemplo: $200,000 en una oferta con `[0, 25,000)` al 15% y `[25,000, ∞)` al 7% produce dos porciones: $25,000 y $175,000. La UI debe desglosarlas; no debe presentar una tasa plana del 15% sobre $200,000.

### 5.2 Algoritmo básico de asignación

Capital para la primera recomendación mensual:

```text
capitalPlanificado = assumedStartingAmountMxn + assumedMonthlyContributionMxn
```

El motor primero ordena las **ofertas elegibles** por la tasa marginal ponderada esperada para el importe candidato, descendente; los empates se resuelven por `Priority` ascendente y `InvestmentOfferId` ascendente. Asigna capital a una oferta y desglosa internamente todos sus tramos marginales según el saldo total recibido por esa oferta. No trata los tramos de una misma oferta como destinos independientes ni asigna primero $25,000 al tramo de 15% para después enviar el excedente a otro producto: si el usuario elige/asigna $200,000 a una oferta escalonada, su cálculo debe incluir cada porción correspondiente.

Para productos con tope total explícito, la capacidad máxima de la oferta es el `MaxAmountMxn` de su último tramo; un excedente se distribuye a la siguiente oferta elegible o queda en `unallocatedAmountMxn`. El saldo no asignable no se fuerza a un producto ni se registra como efectivo real.

Este criterio maximiza tasa anual nominal estimada dentro de los rangos y condiciones **declarados**, pero no considera impuestos, riesgo, liquidez, costo de oportunidad ni restricciones ocultas. La salida debe enumerar las ofertas/tramos excluidos y la razón: vencido, falta de fuente, condición no confirmada, mínimo no alcanzado o sin capacidad.

### 5.3 Proyección mensual de supuestos

- Inicio del mes 1: `saldoInicialSupuesto = AssumedStartingAmountMxn`.
- Antes de la asignación o rendimiento de cada mes se suma `AssumedMonthlyContributionMxn`; ambos importes siempre se muestran como **supuestos**, no como ingresos ni movimientos reales.
- El rendimiento mensual estimado se calcula separadamente para cada porción marginal y se suma por oferta/plan:

```text
rendimientoMesPorTramo = porcionSaldoMes × (tasaAnualPorcentualDelTramo / 100) / 12
rendimientoMesOferta = Σ rendimientoMesPorTramo
```

  Así, $200,000 en `[0, 25,000)` al 15% y `[25,000, ∞)` al 7% usa $25,000 al 15% y $175,000 al 7%; nunca aplica el 15% al saldo completo.

- Para V1 se asume que cada tasa y condición elegible se mantiene sin cambios dentro del horizonte; la gráfica debe marcarlo como escenario y mostrar el `ValidUntil` más próximo. No se prolonga una oferta vencida: si la vigencia no cubre un mes proyectado, ese mes debe exponerse como “sin tasa verificable” y no sumar un rendimiento inventado.
- La proyección compone el rendimiento estimado en el saldo del mes siguiente. La aportación permanece constante por ser un supuesto explícito.
- Redondeo: cálculos internos con precisión decimal; se redondea a dos decimales con `MidpointRounding.AwayFromZero` al total de cada asignación/mes y antes de devolver o persistir importes monetarios. La suma de asignaciones debe ser exactamente `capitalPlanificado - unallocatedAmountMxn` después del ajuste residual documentado en la última asignación elegible.
- No se estiman ISR, inflación, comisiones, retiros anticipados ni penalizaciones. La interfaz no mostrará “ganancia neta”; usará “rendimiento bruto estimado”.

### 5.4 Señal de liquidez por cuentas y MSI

Si el plan está vinculado opcionalmente a una cuenta de efectivo propia, la respuesta puede mostrar como referencia su saldo actual y, por cada mes del horizonte, la suma de `RemainingAmount` de cuotas MSI abiertas con vencimiento en el mes, reutilizando el criterio ya aplicado en `DashboardService`.

La señal se expresa como:

```text
liquidezConceptual = saldoActualCuentaVinculada - aportacionMensualSupuesto - compromisoMSIAbiertoDelMes
```

No se debe llamar “saldo disponible”, porque no incorpora todos los gastos ni obligaciones. Si no hay cuenta vinculada o no hay MSI, se devuelve ausencia explícita (`null`/bandera), no un cero que parezca un dato observado. La lectura no crea `Transaction`, `CreditCharge`, `CreditInstallment`, `CreditPayment`, `InstallmentAllocation` ni modifica `Account.CurrentBalance`.

## 6. Contrato API y autorización

Nuevo controlador candidato: `InvestmentPlansController`, con `[ApiController]`, ruta `api/investment-plans` y `[Authorize(Policy = "UserWithId")]`. Los catálogos pueden vivir bajo `api/investment-products` o, para reducir superficie, en el mismo controlador bajo rutas anidadas. La decisión final debe privilegiar la convención de controladores CRUD actual.

### 6.1 Rutas propuestas

| Método y ruta | Finalidad | Respuesta / errores relevantes |
|---|---|---|
| `GET /api/investment-products` | Lista productos y ofertas del usuario, incluyendo tramos, fuente y estado de vigencia. | `200`; nunca filtra por `userId` recibido. |
| `POST /api/investment-products` | Crea producto dentro de las siete instituciones permitidas. | `201`, `400` para catálogo/rango inválido, `409` para duplicado lógico. |
| `PUT /api/investment-products/{id}` | Actualiza producto/ofertas/tramos con validación de rangos y trazabilidad. | `200`, `400`, `404` para recurso ajeno o ausente, `409` para solapamientos. |
| `DELETE /api/investment-products/{id}` | Desactiva en V1; no elimina un producto o tramo ya referenciado por un plan. | `204`, `409` si la eliminación física compromete historial. |
| `GET /api/investment-plans?month=YYYY-MM` | Obtiene el plan del usuario para un mes. | `200`, `400` por periodo inválido, `404` si no existe. |
| `GET /api/investment-plans/current` | Devuelve el mes de revisión vigente y un borrador heredado del mes anterior con estado de frescura por oferta y condiciones pendientes. | `200` con `carriedFrom`, `staleOffers`, `pendingConditions`; `404` sólo si el usuario no tiene ningún plan previo ni ofertas. |
| `POST /api/investment-plans` | Valida supuestos y confirmaciones, exige captura/vigencia del mes, genera asignación determinista y persiste el escenario. | `201`, `400` por datos inválidos/vencidos, `409` si ya existe plan de ese mes. |
| `PUT /api/investment-plans/{id}` | Recalcula y reemplaza el escenario del mismo propietario; preserva trazabilidad de la nueva generación. | `200`, `404` para recurso ajeno o ausente, `409` si no es editable según estado. |
| `GET /api/investment-plans/{id}/projection` | Devuelve proyección, trazabilidad, exclusiones y señal conceptual de liquidez/MSI. | `200`, `404`; operación estrictamente de lectura. |
| `GET /api/investment-plans/{id}/comparison` | Compara dos planes del mismo usuario o un plan contra un borrador recalculado sin persistir. | `200`, `404`; sin datos externos al usuario. |

DTOs candidatos: `InvestmentProductRequest/Response`, `InvestmentOfferRequest/Response`, `InvestmentOfferTierRequest/Response`, `InvestmentPlanCreateRequest`, `InvestmentPlanResponse`, `InvestmentProjectionResponse`, `InvestmentAllocationResponse`, `InvestmentLiquiditySignalResponse` y `InvestmentExclusionResponse`. Los requests no contienen `UserId`, balances observados ni un rendimiento calculado por el cliente.

### 6.2 Validación y errores

- DataAnnotations para límites de forma; validación de dominio en servicio para rango, solapamiento, relación oferta-producto, vigencia, elegibilidad y pertenencia.
- Mantener el manejo existente de `ArgumentException` → `400 ProblemDetails`; agregar una excepción de conflicto acotada o respuesta `409` consistente para mes duplicado, solapamiento o borrado restringido. No exponer SQL, rutas internas ni datos de otro usuario.
- Para un identificador no perteneciente al usuario, devolver `404` y el mismo cuerpo que para inexistente, evitando enumeración horizontal.
- Paginación no es necesaria para el catálogo inicial pequeño, pero las consultas deben usar proyecciones `AsNoTracking()` y no cargar grafos innecesarios.

## 7. Frontend, rutas y experiencia de uso

### Rutas Next.js propuestas

- Página privada: `app/(app)/investments/page.tsx` → `/investments`.
- BFF: `app/api/bff/investments/products/route.ts`, `app/api/bff/investments/plans/route.ts`, `app/api/bff/investments/plans/[id]/route.ts` y `app/api/bff/investments/plans/[id]/projection/route.ts`.
- Contratos: `lib/contracts/investments.ts`, con normalizadores defensivos equivalentes a los del dashboard.
- Agregar `/investments` a `privateRoutes` y al `matcher` de `middleware.ts`; agregar la entrada de navegación en `components/navigation/nav-config.ts`.

### Flujo UX

1. **Datos de oferta.** Pantalla de catálogo con selector de institución limitado al catálogo V1, producto, tramos, URL/etiqueta de fuente, fecha de consulta, vigencia y condiciones. Ninguna tasa aparece prellenada. Las fuentes se muestran como enlace externo explícito y texto auditable.
2. **Revisión mensual con herencia.** Selector `YYYY-MM` por defecto al mes de Ciudad de México. Al abrir un mes sin plan, la UI ofrece el borrador heredado del mes anterior (supuestos, ofertas, tramos y confirmaciones) marcado como **pendiente de actualizar**. Lista ofertas vencidas, capturas de un mes anterior, tramos sin verificar y condiciones pendientes antes de habilitar “Generar escenario”. Sólo se habilita cuando cada oferta usada tiene `CapturedOn` y vigencia verificadas dentro del mes de revisión.
3. **Supuestos.** Formulario separado y rotulado: “Saldo inicial supuesto” y “Aportación mensual supuesta”. La cuenta existente es opcional y se nombra “Referencia conceptual de liquidez”; seleccionar una no crea ni modifica movimientos.
4. **Confirmación de condiciones.** Cada condición comercial se reproduce textualmente y requiere confirmación consciente. La UI debe aclarar que la aplicación no puede verificar gasto, compras o requisitos externos.
5. **Resultado.** Tabla de asignación con institución/producto, tramo, tasa capturada, fuente/fecha/vigencia, importe asignado y motivo de exclusión cuando aplique. Mostrar importes no asignados en vez de ocultarlos.
6. **Gráfica.** Usar Recharts mediante importación dinámica sin SSR, como la proyección actual. Series: capital supuesto aportado, saldo estimado y rendimiento bruto estimado acumulado. Encabezado persistente: “Escenario con supuestos; no usa ingresos ni saldos reales”. Marcar meses sin tasa vigente verificable como huecos/no calculables, no como cero.
7. **Liquidez.** Tarjeta separada de “referencia conceptual”, con cuotas MSI por mes y la fórmula indicada. Aviso de que no es una recomendación de crédito ni una estimación integral de disponibilidad.

Estados requeridos: carga, sin datos, oferta vencida, condición pendiente, error recuperable del BFF, plan sin asignación posible, y éxito con fecha de generación. Usar controles accesibles, etiquetas asociadas, validaciones comunicadas y formato consistente de moneda/porcentaje.

### Integración con las gráficas de futuro del dashboard

La proyección de inversión se entrega primero en `/investments` y no se mezcla con la proyección de flujo del dashboard. Cuando esa vista esté estable, el dashboard puede consumirla mediante una lectura explícita y etiquetada:

- El endpoint de proyección ya expone series mensuales; el dashboard sólo las presenta, no las recalcula.
- La gráfica del dashboard muestra la serie de inversión como **escenario separado y visiblemente rotulado** (“proyección de inversión con supuestos”), nunca como saldo real ni sumada al saldo proyectado de cuentas.
- Si no existe plan del mes, el dashboard indica ausencia de escenario en lugar de dibujar ceros.
- La capa del dashboard no accede directamente a las tablas de inversión; usa el servicio de inversión.

Esta integración es una fase posterior y opcional, posterior a la Fase 5, porque el objetivo inmediato es la validación mensual del plan.

## 8. Plan de implementación por fases

| Fase | Alcance | Archivos / símbolos candidatos | Evidencia de salida |
|---|---|---|---|
| 0. Contrato de dominio | **Cerrado.** Semántica de tramos marginales, vigencia inferida al 31 de diciembre, plan mensual heredado que exige actualización, atestación por checkbox, ranking sin IA y cuenta vinculada conceptual. | Este plan; revisión con producto. | Decisiones cerradas; sin bloqueos previos a DDL. |
| 1. Persistencia | Entidades, `DbSet`, mapping, restricciones, índices y DDL de nuevas/bases existentes, incluida la herencia mensual (`SourcePlanId`). | `GastosApp.Models/Entities/*Investment*.cs`; `GastosApp.BusinessLogic/Context/ContextSqlGastos.cs`; `SQL/migrations/AAAA-MM-DD_investment_fixed_income_v1.sql`; `SQL/schema.sql`. | Migración aplicada en base aislada; restricciones verificadas. |
| 2. Dominio | Servicio de productos/ofertas, motor puro de elegibilidad/asignación/proyección y reglas de herencia/frescura mensual; lectura MSI aislada. | `Interfaces/Investments/IInvestmentPlanService.cs`; `Services/Investments/InvestmentPlanService.cs`; `Models/Investments/*`; posible extractor de consulta MSI reutilizable desde `DashboardService` sin alterar su respuesta. | Pruebas unitarias deterministas de cálculo, herencia y no mutación. |
| 3. API | DTOs, controlador, DI y errores de conflicto. | `GastosApp.API/Models/Investments/*`; `Controllers/InvestmentPlansController.cs`; `Extensions/ServiceCollectionExtensions.cs`. | Pruebas HTTP autenticadas de ownership, validación y contratos. |
| 4. BFF y contratos web | Proxies server-side, normalizadores y tipos. | `GastosApp.Web/app/api/bff/investments/**/route.ts`; `GastosApp.Web/lib/contracts/investments.ts`. | Typecheck, pruebas de normalización y rechazo de parámetros inválidos. |
| 5. UI | Catálogo, flujo mensual, gráfica, tarjetas y navegación protegida. | `GastosApp.Web/app/(app)/investments/**`; `components/navigation/nav-config.ts`; `middleware.ts`. | Recorrido E2E con datos de prueba y estados límite. |
| 6. Release controlado | Backup, migración, smoke test y rollback previamente ensayado. | Runbook de despliegue; artefactos SQL. | Captura de comandos, versión de migración y resultados de smoke. |
| 7. Dashboard (opcional) | Consumir la proyección de inversión como escenario rotulado en las gráficas de futuro. | `GastosApp.Web/app/(app)/dashboard/**`; contratos de dashboard. | Gráfica con serie etiquetada; sin mezclarla con saldos reales. |

No se agregan bibliotecas en V1: EF Core, validación actual, Next.js y Recharts cubren el alcance. La lógica de asignación debe vivir en una unidad testeable sin reloj o I/O directo; un `IClock` sólo se introduce si el proyecto no dispone de alternativa para fijar fechas en pruebas.

## 9. Migración, despliegue y rollback

1. Respaldar la base de datos con el procedimiento operativo aprobado antes de cualquier DDL.
2. Validar la migración en una copia/restauración aislada: crear tablas, constraints e índices; ejecutar de nuevo para comprobar idempotencia; probar rollback restaurando la copia previa, no eliminando datos productivos a ciegas.
3. Aplicar la migración SQL explícitamente en producción durante ventana controlada; la API no debe ejecutar `Database.Migrate()` ni DDL al iniciar.
4. Desplegar API y frontend compatibles. La UI puede permanecer oculta hasta que API/BFF estén presentes; no desplegar UI que llame rutas inexistentes.
5. Smoke test con un usuario de prueba: crear oferta manual con valores de prueba no comerciales, generar plan, consultar proyección y verificar que no cambió ninguna cuenta, transacción ni cuota MSI.
6. Si falla: retirar la versión de aplicación, detener el uso de las nuevas rutas y restaurar desde el backup validado si el DDL o datos requieren reversión. Una migración de sólo tablas nuevas se puede revertir con un script revisado, pero sólo si se confirma que no hay datos que preservar.

## 10. Gobierno de datos y fuentes

- La fuente comercial se captura manualmente desde la UI. Se requiere URL HTTPS, etiqueta identificable, fecha de consulta y vigencia declarada cuando exista; si no se publica vigencia, se aplica el 31 de diciembre del año capturado y se marca como inferida.
- El texto comercial de un tramo o condición se copia tal cual lo ingresó el usuario, con límite de longitud; la aplicación no lo reformula, no ejecuta IA sobre él y no interpreta legalmente promociones.
- Las ofertas vencidas se preservan para auditoría, se etiquetan como vencidas y quedan excluidas de nueva optimización.
- El resultado persiste snapshots de fuente, producto, tasa y términos para explicar por qué se generó una asignación aunque el catálogo cambie después.
- Se documentará que Banxico SIE es una posible integración futura **exclusiva para CETES**. Si se implementa, usará configuración protegida en servidor y no guardará ni emitirá token alguno a BD, logs, UI, repositorio o bundle del cliente.
- No registrar en logs las URL completas si incluyen parámetros potencialmente sensibles; registrar identificadores internos, tipo de validación y `traceId` cuando aplique.

## 11. Seguridad y privacidad

- API: `[Authorize(Policy = "UserWithId")]` en cada endpoint y `userId` exclusivamente desde `ICurrentUserService`. La validación actual del JWT contra usuario activo, `sessionVersion` y `UserSession` sigue siendo el límite de confianza.
- Pertenencia: todas las queries filtran por `UserId`; toda referencia de producto, oferta, tramo, plan y cuenta se comprueba contra el mismo usuario. Nunca aceptar `UserId` en request ni permitir que `accountId` eluda el filtro.
- BFF: obtener sesión en servidor mediante el patrón existente (`getServerSession` + `fetchApiWithAutoRefresh`); mantener `cache: "no-store"` para datos personalizados. Ningún secreto, token de fuente ni variable de servidor entra en tipos o componentes cliente.
- CSRF: los POST/PUT/DELETE BFF quedan bajo el middleware actual de métodos mutables. Las nuevas rutas se incluyen en el prefijo `/api/bff/` ya protegido; la UI debe enviar el encabezado CSRF establecido por el cliente existente.
- Entrada: validar tamaño, decimal, fecha, institución, URL HTTPS y texto; devolver texto como contenido, no HTML sin sanitizar. No construir SQL ni URLs servidoras desde valores no confiables sin validación/codificación.
- Salida: enlaces de fuentes con protocolo validado; abrir externos con `rel="noopener noreferrer"`. No renderizar condiciones como HTML crudo.
- Autorización no depende de ocultar la ruta `/investments`: middleware protege navegación, BFF exige sesión y la API vuelve a autorizar/preservar ownership.

## 12. Checklist mensual para la persona usuaria

1. Abrir **Inversiones**; el sistema propone el mes de Ciudad de México y muestra el borrador heredado del mes anterior.
2. Verificar cada fuente oficial/comercial y actualizar manualmente la fecha de consulta y vigencia; el plan no se genera con capturas de un mes anterior ni con tasas vencidas.
3. Revisar mínimos, máximos, tasa anual y condiciones textuales de cada tramo.
4. Confirmar con checkbox sólo las condiciones comerciales que realmente se cumplen; la aplicación no verifica consumos ni compras.
5. Introducir o revisar el saldo inicial y la aportación mensual como **supuestos**, no como ingresos reales.
6. Vincular una cuenta únicamente si se desea la referencia conceptual de liquidez; confirmar que la visualización no crea movimientos.
7. Revisar cuotas MSI mostradas, los meses sin tasa verificable, importes no asignados y limitaciones de la proyección.
8. Generar/actualizar el escenario y conservar la fuente/snapshot asociado. El mes siguiente hereda este plan como borrador, no como verdad vigente.

## 13. Plan de pruebas verificable

### Afirmaciones y evidencia mínima

| Afirmación | Prueba propuesta | Evidencia observable |
|---|---|---|
| Los tramos marginales se calculan sin exceder límites y con desglose determinista | Unit tests del motor con rango acotado/no acotado, $200,000 en `[0, 25,000)` al 15% + `[25,000, ∞)` al 7%, remanente inferior al mínimo, empate de ofertas y residual de redondeo | Porciones $25,000/$175,000, interés por tramo, asignaciones, no asignado y suma total exacta esperados. |
| Un tramo con condición no confirmada o una oferta vencida no participa | Unit/integration tests con cada razón de exclusión | Respuesta contiene exclusión explícita; no hay asignación. |
| La proyección usa exclusivamente supuestos y deja hueco al perder vigencia | Unit tests con reloj/fecha fija y vigencias que terminan dentro del horizonte | Etiquetas de supuesto, meses no calculables y ningún rendimiento fabricado. |
| Las tasas no se inventan ni se precargan | Test de formulario/contrato inicial y revisión de seed/migración | Catálogo vacío de ofertas por usuario; no hay tasas comerciales en SQL, fixtures o UI. |
| No hay acceso horizontal | Integration tests con usuario A/B: leer, editar y proyectar ID de A usando sesión B | `404` indistinguible de inexistente, sin filtración de metadatos. |
| Las rutas exigen sesión válida | Integration/BFF tests sin sesión y con sesión expirada | `401`/redirección conforme al patrón existente; API no devuelve datos. |
| La cuenta vinculada pertenece al usuario y no es crédito | Integration tests para cuenta ajena, inactiva y de crédito | `400`/`404` según contrato; no se persiste plan inválido. |
| MSI sólo informa liquidez | Prueba de integración que captura antes/después de `accounts`, `transactions`, `credit_*`, `installment_allocations` | No cambia ninguna fila existente; sólo se crean filas del módulo de inversión. |
| Ninguna operación de inversión muta balances ni transacciones | Test de invariantes antes/después de POST/PUT y de GET de proyección | `Account.CurrentBalance`, conteos y contenido de transacciones/MSI iguales. |
| Fuente y trazabilidad se preservan | Crear plan, modificar/expirar oferta y releer plan | Snapshot del plan conserva fuente, fecha, términos y tasa usados. |
| El plan mensual se hereda pero exige información vigente | Unit/integration tests: heredar el mes anterior, generar sin actualizar captura y luego con captura del mes | `400` con ofertas marcadas como desactualizadas; sólo la captura/vigencia del mes de revisión habilita la generación; `SourcePlanId` registrado. |
| Constraints de BD se cumplen | Pruebas contra PostgreSQL aislado para FK, rango, periodo único, porcentaje, vigencia e índice único | Inserciones inválidas rechazan; índice de búsqueda usado/inspeccionable cuando corresponda. |
| UX representa incertidumbre | Prueba de componente/E2E de datos vacíos, expirados, condición pendiente y serie incompleta | Mensajes accesibles; no se pinta cero como dato real ni se habilita generar indebidamente. |

### Comandos y niveles esperados

Antes de merge, ejecutar como mínimo:

```bash
dotnet build code.sln
cd GastosApp.Web && npm run typecheck && npm run lint && npm test
```

Agregar pruebas .NET al proyecto/suite existente o crear una suite sólo tras confirmar el framework de pruebas elegido y la necesidad. Para pruebas de integración de Postgres, usar una base aislada y limpiable; no apuntar a datos locales compartidos. Ejecutar pruebas de migración y smoke de API con secretos/configuración del entorno, sin imprimirlos.

La ruta de evidencia preferida es: motor puro determinista → integración de EF/PostgreSQL y API autenticada → BFF → un flujo E2E crítico. No duplicar cada escenario en todos los niveles.

## 14. Criterios de aceptación

1. El usuario puede registrar manualmente productos de las siete instituciones permitidas con tramos, tasa, condiciones, fuente, fecha y vigencia, sin una tasa comercial de ejemplo en la aplicación.
2. Sólo ofertas vigentes, auditables y con condiciones confirmadas pueden generar una asignación; cada exclusión es explicable.
3. Existe a lo sumo un plan básico por usuario y mes, con capital/aportación claramente etiquetados como supuestos, y cada mes nuevo se hereda como borrador que debe actualizarse antes de generar.
4. El algoritmo aplica rangos marginales `[min, max)`: desglosa cada porción sin exceder límites, nunca aplica la tasa alta al saldo completo, y conserva un importe no asignado explícito.
5. La proyección mensual muestra saldo y rendimiento bruto estimados, redondeo definido y meses no calculables cuando la vigencia no alcanza el horizonte.
6. La cuenta vinculada y MSI sólo se leen para una señal conceptual; pruebas demuestran invariantes de no mutación sobre cuentas, transacciones, créditos y cuotas.
7. Todo recurso es user-scoped en API, BFF y UI; una sesión de otro usuario no puede leer ni cambiar datos por identificador.
8. Catálogo, plan y proyección son accesibles desde `/investments`, con estados de carga/error/vencimiento y gráficas consistentes con Recharts sin errores de hidratación; si el dashboard consume la proyección, la serie se muestra rotulada como escenario y nunca sumada a saldos reales.
9. DDL para instalación nueva y migración de despliegues existentes son idempotentes, se prueban de forma aislada y cuentan con rollback ensayado.

## 15. Riesgos y decisiones resueltas

| Tema | Riesgo | Decisión |
|---|---|---|
| Vigencia no publicada | Una tasa sin fecha publicada no debe mantenerse indefinidamente. | **Resuelto:** establecer `ValidUntil` al 31 de diciembre del año de `CapturedOn`, marcar `ValidityInferred = true` y exigir recaptura para el siguiente año. |
| Interpretación de tramos | Algunas instituciones aplican tasa marginal, escalonada o a todo el saldo. | **Resuelto para V1:** tramos marginales. Para $200,000 con `[0, 25,000)` al 15% y `[25,000, ∞)` al 7%, calcular $25,000 al 15% + $175,000 al 7%. No admitir tasa plana implícita. |
| Condiciones especiales | Un checkbox no verifica consumos, compras o saldos reales. | **Resuelto:** atestación manual con checkbox y confirmación auditada; la aplicación no verifica compras/gasto/saldo real. |
| Optimización por tasa nominal | Puede favorecer una oferta menos líquida o con riesgo/costos no modelados. | **Resuelto:** V1 muestra ranking y escenario explicable, sin recomendación personalizada. La recomendación asistida por IA se evalúa en V2 con herramientas específicas y de sólo lectura sobre datos declarados; nunca inventa tasas, productos ni condiciones. |
| Cuenta vinculada | El saldo existente puede ser obsoleto o no representar efectivo disponible. | **Resuelto:** sólo cuentas activas no-crédito del mismo usuario, siempre rotuladas como “referencia conceptual de liquidez”; no habilita ni simula financiamiento. |
| Edición de plan | Reemplazar un plan puede perder comparación histórica. | **Resuelto:** un plan editable por mes, heredado del mes anterior como borrador, que exige actualizar captura/vigencia del mes; `SourcePlanId` y snapshots conservan la trazabilidad. Versionado completo queda para V2. |
| Banxico SIE | Un conector futuro modifica frecuencia, datos y secretos operativos. | Mantener fuera de V1; diseñar una interfaz de fuente futura sólo cuando se autorice el conector CETES. |

## 16. Estimación

**Esfuerzo estimado: 8–12 días-persona**, excluyendo la revisión financiera/legal de la presentación. Desglose orientativo: persistencia/migración 1.5–2; motor y pruebas 2–3; API/BFF 1.5–2; UI/gráficas 2–3; integración, hardening y despliegue 1–2 días. Las decisiones de producto están cerradas; la mayor incertidumbre restante es la verificación manual de que cada fuente realmente publica tramos marginales y vigencia.

---

## Validación de este artefacto

```yaml
status: complete
executive_summary: >
  Se definió un plan V1 aislado para capturar manualmente ofertas auditables de
  renta fija MX, generar un escenario mensual con supuestos y reutilizar MSI
  únicamente como señal conceptual de liquidez. El diseño evita transacciones,
  cambios de saldo, scraping, tasas inventadas, crédito simulado y secretos.
artifacts:
  - /home/jams45072/Proyectos/Gastos/docs/PLAN_INVERSION_RENTA_FIJA_V1.md
next_recommended:
  - Convertir las fases 1 y 2 en tareas implementables.
  - Abrir V2 sólo si se autoriza la recomendación asistida por IA con herramientas específicas de sólo lectura.
risks:
  - Las tasas y condiciones comerciales cambian; la captura manual puede quedar obsoleta.
  - La tasa nominal no representa impuestos, liquidez, riesgo, comisiones ni penalizaciones.
  - La fuente debe verificarse manualmente para que sus tramos realmente sean marginales; V1 no infiere esta semántica.
skill_resolution:
  dotnet-web: aplicado para respetar API, DI, DTOs, EF Core y arquitectura existente.
  nextjs: aplicado para App Router, BFF, sesión de servidor, rutas protegidas y Recharts.
  supabase-postgres-best-practices: aplicado para restricciones, índices, DDL idempotente y validación aislada.
  web-security: aplicado para JWT user-scoped, ownership, CSRF, validación y no exposición de secretos.
  web-testing: aplicado para pruebas por capa, determinismo, integración y no mutación.
  verification-planning: aplicado para afirmaciones, evidencia mínima y ruta verificable de release.
validation:
  repository_facts: coherent_with_verified_sources
  invented_rates_or_secrets: none
  target_directory: exists
  modified_files: 1
```
