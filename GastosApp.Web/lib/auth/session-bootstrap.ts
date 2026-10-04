export type BootstrapState = "valid" | "invalid" | "retry" | "forbidden";

export function createSessionBootstrap(request: () => Promise<Response>) {
  let pending: Promise<BootstrapState> | undefined;
  return (): Promise<BootstrapState> => {
    if (!pending) {
      pending = request().then((response): BootstrapState =>
        response.ok ? "valid" : response.status === 401 ? "invalid" : response.status === 403 ? "forbidden" : "retry"
      ).catch((): BootstrapState => "retry").finally(() => { pending = undefined; });
    }
    return pending;
  };
}

// Shared only while pending: StrictMode replay joins request, later mounts revalidate.
export const bootstrapSession = createSessionBootstrap(() => fetch("/api/auth/session", {
  cache: "no-store",
  signal: AbortSignal.timeout(15_000)
}));

export function observeBootstrap(pending: Promise<BootstrapState>, update: (state: BootstrapState) => void) {
  let active = true;
  void pending.then((state) => { if (active) update(state); });
  return () => { active = false; };
}
