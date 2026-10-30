import { hasJobOverviewShape, normalizeJobOverview } from "@/lib/contracts/jobs";
import {
  callJobsApi,
  jobsErrorResponse,
  jobsJsonResponse,
  jobsMalformedResponse,
  readJsonOrNull,
  readUpstreamError,
  requireJobsAdmin
} from "./_lib/jobs-bff";

/**
 * Catálogo de los cinco jobs con el estado del horario, la última corrida, la corrida en curso y los
 * conteos (S1/S2). La pantalla no deduce nada de la configuración: todo eso lo publica la API.
 */
export async function GET(request: Request) {
  const guard = await requireJobsAdmin(request);
  if (!guard.ok) return guard.response;

  const call = await callJobsApi(guard.session, "/api/jobs", { method: "GET" });

  if (!call.response.ok) {
    return jobsErrorResponse(await readUpstreamError(call.response), call.response.status, call);
  }

  const raw = await readJsonOrNull(call.response);
  if (!hasJobOverviewShape(raw)) {
    return jobsMalformedResponse("La API devolvió un catálogo de jobs con una forma inesperada.", call);
  }

  const overview = normalizeJobOverview(raw);
  // El catálogo es fijo (cinco jobs), así que una lista vacía solo puede venir de un cuerpo que no
  // se pudo interpretar; mostrarla vacía haría creer que no hay jobs monitoreados.
  if (overview.jobs.length === 0) {
    return jobsMalformedResponse("La API devolvió un catálogo de jobs vacío.", call);
  }

  return jobsJsonResponse(overview, 200, call);
}
