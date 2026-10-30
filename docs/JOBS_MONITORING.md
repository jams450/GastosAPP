# Monitorear y ejecutar los jobs

El módulo **Administración → Jobs** (`/jobs`) permite a los administradores consultar el estado y el historial persistente de los cinco procesos automáticos y solicitar una ejecución manual confirmada.

## Antes de usarlo

1. Aplicar mediante el procedimiento habitual la migración `SQL/migrations/2026-11-01_job_monitoring.sql`. El desarrollo no la aplica automáticamente.
2. Iniciar la API y acceder con una sesión de administrador. El módulo necesita la tabla `job_runs`; si no puede escribir el historial, no inicia trabajo con efectos secundarios.
3. Consultar la configuración y el alcance del job antes de pulsar **Ejecutar**. Confirmar solicita trabajo real, no una simulación.

No agrega claves de configuración ni habilita automáticamente procesos. Está diseñado para **una sola instancia de API**; los candados no son distribuidos.

## Procesos incluidos

| Clave | Alcance y programación existente |
|---|---|
| `email_ingest` | Correo del usuario configurado en `Email:Ingest:UserId`; espera el siguiente horario UTC antes de su primera ejecución automática. La ejecución manual comparte y avanza el mismo cursor de correo. |
| `fx_rate_sync` | Sincronización de tipos de cambio; ejecución al arrancar y después diaria. |
| `recurring_execution` | Gastos programados del usuario configurado para Telegram; al arrancar y por intervalo de evaluación. Puede materializar y ejecutar partidas financieras. |
| `alert_evaluation` | Evaluación de alertas del usuario configurado para Telegram; al arrancar y por intervalo. |
| `alert_dispatch` | Procesamiento de la cola de alertas; al arrancar y por intervalo de envío. Puede enviar mensajes Telegram. |

Las ejecuciones manuales ignoran **solo** el interruptor de programación automática. No cambian el usuario configurado ni omiten validaciones de negocio, credenciales, capacidades IMAP o disponibilidad de salida Telegram. Un job puede terminar omitido si falta configuración válida.

## Interpretar los resultados

| Estado | Significado |
|---|---|
| En ejecución (`running`) | Se registró la ejecución y aún no tiene cierre persistido. |
| Correcto (`succeeded`) | El proceso informó finalización satisfactoria. |
| Parcial (`partial`) | Terminó con resultados y fallos parciales. |
| Fallido (`failed`) | Falló la ejecución. Se expone un tipo de error, no mensajes privados. |
| Omitido (`skipped`) | No realizó trabajo por una condición de negocio o configuración. |
| Interrumpido (`interrupted`) | Se interrumpió por apagado o se recuperó un registro pendiente de una instancia anterior. |

El historial muestra origen automático/manual, solicitante cuando corresponde, fechas, duración y contadores. Se conserva sin purga automática y se consulta con filtros y paginación. La próxima ejecución de procesos por intervalo aparece sin fecha cuando el instante exacto no está disponible; no es un fallo del job.

## Ejecutar a demanda con seguridad

- Revisar el aviso de efectos y confirmar explícitamente. El motivo opcional tiene un máximo de 200 caracteres.
- La API responde `202` cuando existe el registro de ejecución; no espera a que el proceso termine. Cerrar el navegador no cancela el trabajo.
- No hay cola: otra solicitud del mismo job en curso responde `409`. Jobs diferentes pueden ejecutarse simultáneamente.
- Si la respuesta es incierta, consultar el historial antes de volver a solicitar. La interfaz no reintenta automáticamente el POST.
- Al reiniciar, la reconciliación marca como interrumpidos los registros que quedaron en ejecución. Si esa reconciliación falla, no se inicia trabajo nuevo hasta que se recupere.
- Si falla la persistencia del cierre, el registro puede permanecer en ejecución hasta la reconciliación del siguiente arranque; el estado mostrado es el registrado, no una garantía de que el proceso siga vivo.

## API administrativa

Todos los endpoints requieren `AdminWithId`. El JSON del backend utiliza **PascalCase**.

| Método y ruta | Resultado |
|---|---|
| `GET /api/jobs` | Catálogo, configuración operativa, estado actual, último resultado y conteos. |
| `GET /api/jobs/history?jobKey=&status=&trigger=&page=1&pageSize=25` | Historial filtrable; tamaño de página entre 1 y 100. |
| `GET /api/jobs/{jobRunId}` | Detalle de una ejecución. |
| `POST /api/jobs/{jobKey}/run` | Cuerpo `{ "Confirm": true, "Reason": "opcional" }`; inicia una ejecución manual. |

Errores de inicio: `confirmation_required`/`unknown_job` (400), `already_running` (409), `shutting_down` (503), `history_unavailable` (500). Un fallo de historial impide iniciar efectos secundarios. No se admiten claves arbitrarias.

## Límites de verificación

Las pruebas automatizadas utilizan dobles sin conexiones reales. Build y pruebas no certifican aplicación de SQL, traducción de consultas contra PostgreSQL ni comportamiento visual en un navegador autenticado. La migración, el acceso real y las ejecuciones con proveedores requieren validación operativa separada y explícita.
