import {
  buildJobHistoryQuery,
  clampHistoryPage,
  clampHistoryPageSize,
  hasJobHistoryShape,
  isJobKey,
  isJobStatus,
  isJobTrigger,
  normalizeJobHistory,
  type JobHistoryFilterSelection
} from "@/lib/contracts/jobs";
import {
  callJobsApi,
  jobsErrorResponse,
  jobsJsonResponse,
  jobsMalformedResponse,
  readJsonOrNull,
  readUpstreamError,
  requireJobsAdmin
} from "../_lib/jobs-bff";

function invalidFilter(message: string) {
  return jobsErrorResponse({ code: "INVALID_FILTER", message }, 400, null);
}

function readIntegerParam(raw: string | null): { ok: true; value: number | null } | { ok: false } {
  if (raw === null || raw.trim() === "") return { ok: true, value: null };
  const value = Number(raw);
  return Number.isInteger(value) ? { ok: true, value } : { ok: false };
}

/**
 * Historial paginado con filtros opcionales por job, estado y origen.
 *
 * Un filtro fuera del vocabulario se rechaza aquí, antes de llamar a la API: una página vacía sería
 * indistinguible de "no hay historial" y esta pantalla existe justamente para distinguir eso. La
 * paginación se acota igual que el servidor (1..100) y por defecto se pide la primera página con 25
 * filas, que es el tamaño por defecto de la API.
 */
export async function GET(request: Request) {
  const guard = await requireJobsAdmin(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);

  const rawJobKey = searchParams.get("jobKey")?.trim() ?? "";
  if (rawJobKey !== "" && !isJobKey(rawJobKey)) {
    return invalidFilter("El job indicado no existe.");
  }

  const rawStatus = searchParams.get("status")?.trim().toLowerCase() ?? "";
  if (rawStatus !== "" && !isJobStatus(rawStatus)) {
    return invalidFilter("El estado indicado no existe.");
  }

  const rawTrigger = searchParams.get("trigger")?.trim().toLowerCase() ?? "";
  if (rawTrigger !== "" && !isJobTrigger(rawTrigger)) {
    return invalidFilter("El origen indicado debe ser automatic o manual.");
  }

  const rawPage = readIntegerParam(searchParams.get("page"));
  if (!rawPage.ok) return invalidFilter("page debe ser un número entero.");
  const rawPageSize = readIntegerParam(searchParams.get("pageSize"));
  if (!rawPageSize.ok) return invalidFilter("pageSize debe ser un número entero.");

  const page = clampHistoryPage(rawPage.value ?? 1);
  const pageSize = clampHistoryPageSize(rawPageSize.value ?? 25);

  const filters: JobHistoryFilterSelection = {
    jobKey: isJobKey(rawJobKey) ? rawJobKey : "all",
    status: isJobStatus(rawStatus) ? rawStatus : "all",
    trigger: isJobTrigger(rawTrigger) ? rawTrigger : "all",
    page,
    pageSize
  };

  const call = await callJobsApi(guard.session, `/api/jobs/history?${buildJobHistoryQuery(filters)}`, {
    method: "GET"
  });

  if (!call.response.ok) {
    return jobsErrorResponse(await readUpstreamError(call.response), call.response.status, call);
  }

  const raw = await readJsonOrNull(call.response);
  if (!hasJobHistoryShape(raw)) {
    return jobsMalformedResponse("La API devolvió un historial de jobs con una forma inesperada.", call);
  }

  return jobsJsonResponse(normalizeJobHistory(raw, { page, pageSize }), 200, call);
}
