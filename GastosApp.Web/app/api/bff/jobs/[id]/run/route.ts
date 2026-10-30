import { buildManualRunRequest, isJobKey, normalizeManualRunAccepted } from "@/lib/contracts/jobs";
import {
  callJobsApi,
  jobsErrorResponse,
  jobsJsonResponse,
  jobsMalformedResponse,
  readJsonOrNull,
  readUpstreamError,
  requireJobsAdmin
} from "../../_lib/jobs-bff";

type Params = { params: Promise<{ id: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Ejecución a demanda (S3). La confirmación explícita se exige **dos veces**: en la pantalla y aquí,
 * porque una ruta BFF no prueba que alguien haya leído el aviso. Sin `Confirm: true` no se llama a la
 * API y no se abre ninguna corrida.
 *
 * La API responde 202 cuando la fila de historial ya existe y el job arrancó, o 409 si ya había una
 * corrida en curso. No se reintenta nada aquí: reintentar convertiría un 409 en una segunda corrida.
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireJobsAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const jobKey = id.trim();
  if (!isJobKey(jobKey)) {
    return jobsErrorResponse({ code: "UNKNOWN_JOB", message: "El job indicado no existe." }, 400, null);
  }

  const body: unknown = await request.json().catch(() => null);
  const confirm = isRecord(body) ? body.Confirm ?? body.confirm : undefined;
  if (confirm !== true) {
    return jobsErrorResponse(
      {
        code: "CONFIRMATION_REQUIRED",
        message: "La ejecución manual exige confirmación explícita (confirm: true)."
      },
      400,
      null
    );
  }

  const rawReason = isRecord(body) ? body.Reason ?? body.reason : undefined;
  if (rawReason !== undefined && rawReason !== null && typeof rawReason !== "string") {
    return jobsErrorResponse({ code: "BAD_REQUEST", message: "El motivo debe ser texto." }, 400, null);
  }

  const runRequest = buildManualRunRequest(typeof rawReason === "string" ? rawReason : null);
  if (!runRequest.ok) {
    return jobsErrorResponse({ code: "BAD_REQUEST", message: runRequest.message }, 400, null);
  }

  const call = await callJobsApi(guard.session, `/api/jobs/${encodeURIComponent(jobKey)}/run`, {
    method: "POST",
    body: JSON.stringify(runRequest.body)
  });

  if (call.response.status !== 202) {
    // Un 2xx que no sea 202 no prueba que la corrida se haya abierto; presentarlo como éxito
    // repetiría el error que este módulo evita.
    if (call.response.ok) {
      return jobsMalformedResponse("La API respondió con un estado inesperado al aceptar la corrida.", call);
    }
    return jobsErrorResponse(await readUpstreamError(call.response), call.response.status, call);
  }

  const raw = await readJsonOrNull(call.response);
  const accepted = normalizeManualRunAccepted(raw);
  if (!accepted) {
    return jobsMalformedResponse("La API aceptó la corrida sin devolver su identificador.", call);
  }

  return jobsJsonResponse(accepted, 202, call);
}
