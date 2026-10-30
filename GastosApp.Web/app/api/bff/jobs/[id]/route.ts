import { normalizeJobRunDetail } from "@/lib/contracts/jobs";
import {
  callJobsApi,
  jobsErrorResponse,
  jobsJsonResponse,
  jobsMalformedResponse,
  readJsonOrNull,
  readUpstreamError,
  requireJobsAdmin
} from "../_lib/jobs-bff";

type Params = { params: Promise<{ id: string }> };

function parseJobRunId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Detalle de una corrida, incluido el nombre legible del job (L7: `GET /api/jobs/{int}`). */
export async function GET(request: Request, { params }: Params) {
  const guard = await requireJobsAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const jobRunId = parseJobRunId(id);
  // Una ruta que no identifica una corrida no se reenvía: el 404 es la respuesta honesta.
  if (jobRunId === null) {
    return jobsErrorResponse({ code: "NOT_FOUND", message: "La corrida indicada no existe." }, 404, null);
  }

  const call = await callJobsApi(guard.session, `/api/jobs/${jobRunId}`, { method: "GET" });

  if (!call.response.ok) {
    return jobsErrorResponse(await readUpstreamError(call.response), call.response.status, call);
  }

  const raw = await readJsonOrNull(call.response);
  const detail = normalizeJobRunDetail(raw);
  if (!detail) {
    return jobsMalformedResponse("La API devolvió una corrida con una forma inesperada.", call);
  }

  return jobsJsonResponse(detail, 200, call);
}
