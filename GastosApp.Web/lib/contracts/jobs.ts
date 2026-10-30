/**
 * Contrato de la pantalla administrativa de jobs (S1/S2/S3).
 *
 * Este archivo es la superficie pública —lo único que el BFF y la pantalla importan— y por eso
 * reexporta nombres explícitos y no módulos enteros: la lista no cambia cuando un módulo crece, y un
 * helper interno nuevo no se filtra al contrato por accidente. Los módulos que respalda son
 * responsabilidades separadas, no un corte por tipo de archivo:
 *
 * - `jobs-vocabulary.ts` — claves, estados, orígenes y acotamiento de páginas.
 * - `jobs-runs.ts` — forma de una corrida, sus conteos y el horario de un job.
 * - `jobs-overview.ts` — catálogo pintable y totales derivados.
 * - `jobs-history.ts` — página del historial y sus filtros.
 * - `jobs-manual-run.ts` — confirmación explícita y motivo opcional de una corrida manual.
 * - `jobs-errors.ts` — errores con código estable y mensajes por defecto.
 *
 * Las coerciones de payload (`jobs-payload.ts`) quedan fuera de la superficie: son detalle interno de
 * estos módulos, no algo que la pantalla deba importar.
 *
 * Reglas deliberadas, porque esta pantalla decide si se ejecuta un job:
 * - Una corrida con un estado, un origen o una fecha de inicio que no se puede interpretar **se
 *   descarta**: pintarla con valores inventados haría creer que el job corrió.
 * - Una clave de job ajena al catálogo se descarta del catálogo; el historial sí conserva claves
 *   retiradas, porque la API guarda su nombre y su historial indefinidamente (L5).
 * - Los totales se derivan de los seis estados contados: el `total` que llegue por cable no puede
 *   sumar un estado que la pantalla no sabe pintar.
 * - Nunca se leen mensajes de error crudos ni contenido de correo: `failureType` es un tipo de
 *   excepción o un código estable, y `outcomeCode` un código del catálogo del job.
 * - El motivo de una corrida manual se valida pero **no se persiste**: la API acepta `Reason` y el
 *   historial no lo guarda. La pantalla no promete auditoría del motivo.
 */

export {
  JOB_KEYS,
  JOB_STATUSES,
  JOB_TRIGGERS,
  JOB_SCHEDULE_KINDS,
  JOB_HISTORY_PAGE_SIZES,
  JOB_HISTORY_DEFAULT_PAGE_SIZE,
  JOB_HISTORY_MAX_PAGE_SIZE,
  MANUAL_RUN_REASON_MAX_LENGTH,
  clampHistoryPage,
  clampHistoryPageSize,
  isJobKey,
  isJobStatus,
  isJobTrigger
} from "./jobs-vocabulary.ts";

export type { JobKey, JobStatus, JobTrigger, JobScheduleKind } from "./jobs-vocabulary.ts";

export {
  emptyJobStatusCounts,
  isRunInProgress,
  normalizeJobRunSummary,
  normalizeJobRunDetail,
  normalizeJobSchedule,
  describeJobSchedule
} from "./jobs-runs.ts";

export type { JobStatusCounts, JobRunSummary, JobRunDetail, JobSchedule } from "./jobs-runs.ts";

export { hasJobOverviewShape, normalizeJobOverview } from "./jobs-overview.ts";

export type { JobCatalogItem, JobOverview } from "./jobs-overview.ts";

export { hasJobHistoryShape, normalizeJobHistory, buildJobHistoryQuery } from "./jobs-history.ts";

export type { JobHistoryPage, JobHistoryFilterSelection } from "./jobs-history.ts";

export {
  normalizeManualRunAccepted,
  validateManualRunReason,
  buildManualRunRequest
} from "./jobs-manual-run.ts";

export type {
  ManualRunAccepted,
  ManualRunReasonResult,
  ManualRunRequestBody,
  ManualRunRequestResult
} from "./jobs-manual-run.ts";

export { JOB_ERROR_CODES, normalizeJobError } from "./jobs-errors.ts";

export type { JobErrorCode, JobError } from "./jobs-errors.ts";
