import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { badRequest, unauthorized } from "@/lib/bff/http";
import { proxyJsonWithSession } from "@/lib/bff/proxy";
import { validateTransferPayload } from "@/lib/contracts/transactions";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized(request);
  }

  const body = await request.json();
  const validation = validateTransferPayload(body);
  if (!validation.ok) {
    return badRequest(request, validation.message);
  }

  const { response } = await proxyJsonWithSession({
    request,
    session,
    url: `${getApiBaseUrl()}/api/transactions/transfer`,
    init: {
      method: "POST",
      body: JSON.stringify(validation.data),
      cache: "no-store"
    },
    upstreamErrorMessage: "Failed to create transfer transaction"
  });

  return response;
}
