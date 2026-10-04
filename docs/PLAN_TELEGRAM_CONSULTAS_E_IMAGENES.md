# Plan: consultas financieras e imágenes en Telegram

Estado: propuesta acordada, pendiente de implementación. Este documento no autoriza despliegues, cambios de servicios, ejecución de SQL, commits ni publicación.

## Objetivo
Ampliar Telegram con consultas financieras de solo lectura y captura de notificaciones bancarias mediante imágenes, usando borradores que requieren confirmación explícita antes de registrar movimientos.

## Decisiones acordadas
- Efectivo = cuentas con `IsCredit=false`, incluidos bancos y débito.
- Crédito = cuentas con `IsCredit=true`.
- Pago de tarjetas del mes: reutilizar exactamente el cálculo existente del dashboard, no crear otra fórmula.
- Resúmenes de ingresos, gastos y neto: todas las cuentas, solo efectivo o solo crédito.
- Consultar presupuestos configurados y cuáles enviaron alertas.
- Consultas: mes actual por defecto y posibilidad de solicitar otro periodo; verificar reglas de zona horaria del dashboard antes de implementar.
- Capturas: extraer monto, cuenta, fecha y descripción cuando sean legibles. No inferir categoría ni subcategoría de la imagen; preguntar según las reglas actuales del registro.
- Nunca guardar automáticamente: resolver datos faltantes, mostrar resumen y exigir confirmación explícita. Correcciones invalidan confirmación anterior.
- Usuario acepta envío de imágenes al proveedor IA. Procesamiento efímero local: no almacenar imágenes permanentemente en disco/BD ni incluirlas en logs; descartarlas al terminar, también en rutas de error.
- Proveedor de pruebas: MiMo mediante CommandCode GOAT, elegido por el usuario.
- Configuración del extractor mediante variables de entorno: proveedor, URL base, modelo y credencial separados del proveedor del chat. Nombres definitivos por definir al implementar; no guardar valores secretos en código ni documentación.
- Proveedor de producción: API directa de Google; modelo económico con visión por seleccionar y validar.
- Misma interfaz de extracción y DTO para ambos proveedores, configurable por ambiente. Sin fallback automático entre proveedores.
- Debe probarse Google antes de producción: resultados de MiMo no validan comportamiento de Google.

## Fase 1: consultas financieras
1. Trazar fórmula exacta, periodo y reglas del pago de tarjetas del dashboard. La exploración encontró ciclos y cargos, pero no demostró el cálculo completo.
2. Reutilizar servicios deterministas para saldos de efectivo, crédito disponible y pagos de tarjetas por cuenta y total. Comprobar signos de saldo/deuda y fórmula existente de disponible.
3. Añadir resumen ingresos/gastos/neto con filtros todas/efectivo/crédito y periodo explícito. Evitar doble conteo de compras y pagos de tarjeta; mantener semántica del dashboard.
4. Añadir consulta de presupuestos: monto, gastado, comprometido, restante y umbrales conforme al servicio existente.
5. Añadir consulta de alertas: distinguir umbral alcanzado, pendiente, enviado y fallido. Usar estado real de outbox y fecha de envío; existir una alerta lógica no prueba envío. Enviado no prueba lectura del usuario.
6. Registrar herramientas de solo lectura en el kernel. Identidad y cálculos se resuelven por código; el modelo no elige `userId` ni calcula importes financieros.
7. Probar alcance por usuario, filtros, periodos, cuentas vacías, reglas de crédito, presupuestos y estados de envío.

## Fase 2: imágenes a borradores
1. Verificar CommandCode GOAT para MiMo: endpoint, modelo exacto, soporte de imagen, precios y permiso de uso en backend financiero no orientado a programación. Configurar proveedor, URL base, modelo y credencial mediante variables de entorno.
2. Comprobar soporte multimodal del cliente actual o añadir adaptador independiente del extractor de texto.
3. Admitir fotos de Telegram, seleccionar resolución adecuada y decidir si se soportarán documentos de imagen.
4. Descargar de forma segura tras validar identidad/chat. Limitar bytes, dimensiones, formatos, cantidad, tiempos y concurrencia. No registrar URL de descarga, que puede contener token.
5. Extraer salida estructurada limitada: monto/moneda, cuenta sugerida, fecha y descripción, con datos ausentes/ambiguos explícitos. Identificar tipo de operación o preguntar: compra, ingreso, devolución, transferencia y pago no son equivalentes.
6. Tratar imagen y salida del modelo como datos no confiables. Extractor sin herramientas, sin escritura y sin capacidad de guardar; ignorar instrucciones visibles en la imagen.
7. Resolver cuenta solo contra catálogo autorizado usando matcher existente. Fecha ausente/ambigua y cuenta parcialmente oculta requieren aclaración, sin inventar valores.
8. Integrar extracción parcial con borrador durable existente; preguntar categoría, subcategoría cuando corresponda y demás datos faltantes; conservar cancelación y confirmación explícita.
9. Definir control de duplicados entre imágenes reenviadas en updates distintos. Ledger actual evita repetición del mismo update, no el reenvío de la misma captura.
10. Validar MiMo y Google con las mismas capturas sanitizadas. Medir precisión, coste real, latencia y tasa de correcciones antes de elegir modelo de producción.

## Arquitectura recomendada
`Telegram imagen -> descarga efímera -> extractor configurable -> validación -> borrador -> aclaraciones -> resumen -> confirmación -> servicio existente de registro`.

Separar extractor de imágenes del kernel conversacional y sus herramientas. No añadir OCR separado al MVP salvo que pruebas de precisión/privacidad lo justifiquen. Consultas financieras no requieren IA para realizar cálculos.

## Evidencia y puntos de entrada
- `GastosApp.API/Services/Telegram/ExpenseAgentService.cs`: herramientas y kernel actuales.
- `GastosApp.API/Services/Telegram/TelegramToolService.cs`: consultas y catálogos existentes.
- `GastosApp.API/Services/Telegram/TelegramUpdateService.cs`: idempotencia por update; actualmente descarta mensajes sin texto.
- `GastosApp.API/Services/Telegram/TelegramConversationService.cs`: borradores y campos requeridos.
- `GastosApp.API/Services/Telegram/TelegramTransactionService.cs`: resolución de catálogos y confirmación.
- `GastosApp.BusinessLogic/Services/Catalog/CatalogNameMatcher.cs`: prioridad de coincidencia exacta única; corrección en `cac6a74`.
- `GastosApp.BusinessLogic/Services/Dashboard/DashboardService.cs`: resúmenes financieros; trazar cálculo completo de pago de crédito.
- `GastosApp.BusinessLogic/Services/Credits/CreditCycleService.cs`: ciclos; no asumir que por sí solo calcula pago mensual.
- `GastosApp.AI/Intent/ExpenseIntentExtractor.cs`: extracción actual de texto; visión no comprobada.
- `odd/tasks/telegram-conversational-transactions.md` y `docs/TELEGRAM_CONVERSATIONAL_TRANSACTIONS.md`: trabajo previo de borradores.

## Riesgos y decisiones pendientes
- CommandCode GOAT elegido para pruebas con MiMo; la documentación revisada no prueba soporte multimodal exacto ni autorización de uso como bot financiero. No afirmar prohibición ni permiso sin verificar.
- Confirmar moneda, semántica de importes y zona horaria conforme al dashboard; no sumar monedas distintas sin reglas explícitas.
- Definir interacción de consultas o imágenes con un borrador ya abierto; no sobrescribir silenciosamente.
- Confirmar límites de imagen, soporte de documentos, política de duplicados y modelo Google.
- Descartar localmente no elimina copia de Telegram ni garantiza retención cero del proveedor. Revisar políticas de proveedor e intermediario.
- Precios de planes coding no equivalen a precio directo MiMo. Estimaciones basadas en caché de código no estiman consumo de imágenes.

## Verificación prevista
- Pruebas deterministas con clientes Telegram/IA simulados; no usar servicios vivos para pruebas unitarias.
- Consultas: aislamiento por usuario, resultados vacíos, filtros, mes solicitado, coincidencia con dashboard y estado real de alertas.
- Imágenes: sin texto, formato/tamaño inválido, descarga fallida, JSON malformado, campos ambiguos, inyección de instrucciones, limpieza en errores y aislamiento de identidad.
- Borrador: datos incompletos, corrección, cancelación, confirmación sin nueva llamada al modelo, update repetido y captura reenviada.
- Validación controlada de proveedor con capturas sanitizadas, sin secretos ni credenciales en documentación/logs.

## Próximo paso al retomar
Leer este plan y contexto persistido; revisar estado Git sin modificar cambios existentes. Verificar endpoint y condiciones de CommandCode GOAT para MiMo y diseñar configuración del extractor mediante variables de entorno. Antes de implementar, confirmar alcance de fase y crear seguimiento ODD. No se implementó ninguna función durante esta conversación.
