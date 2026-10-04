type TokenSession = { accessToken: string; refreshToken?: string };
type ApiResult<S> = { response: Response; session: S };

// Only an explicit refresh rejection is terminal. Unavailability must not log users out.
export async function autoRefresh<S extends TokenSession>(
  session: S,
  execute: (token: string) => Promise<Response>,
  refresh: () => Promise<S | Response>
): Promise<ApiResult<S>> {
  const first = await execute(session.accessToken);
  if (first.status !== 401 || !session.refreshToken) return { response: first, session };
  const renewed = await refresh();
  if (renewed instanceof Response) {
    return { response: renewed.status === 401 ? first : new Response(null, { status: 503 }), session };
  }
  try {
    return { response: await execute(renewed.accessToken), session: renewed };
  } catch {
    return { response: new Response(null, { status: 503 }), session: renewed };
  }
}

export async function validateSession<S>(
  session: S | null,
  validate: (session: S) => Promise<ApiResult<S>>
): Promise<{ status: 200 | 401 | 503; session?: S }> {
  if (!session) return { status: 401 };
  try {
    const result = await validate(session);
    if (result.response.ok) return { status: 200, session: result.session };
    return { status: result.response.status === 401 ? 401 : 503, session: result.session };
  } catch {
    return { status: 503 };
  }
}
