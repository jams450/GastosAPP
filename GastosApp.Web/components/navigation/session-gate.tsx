"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { bootstrapSession, observeBootstrap, type BootstrapState } from "@/lib/auth/session-bootstrap";

export function SessionGate({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<BootstrapState | "loading">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => observeBootstrap(bootstrapSession(), (result) => {
    setState(result);
    if (result === "invalid") router.replace("/login");
  }), [router, attempt]);

  if (state === "valid") return children;
  return <main className="app-page" aria-busy={state === "loading"}>
    <div role="status" className="p-6">
      {state === "loading" ? "Validando sesión…" : state === "invalid" ? "Redirigiendo al inicio de sesión…" :
        state === "forbidden" ? "Tu sesión no tiene permisos de administrador." : "No pudimos validar tu sesión. Intenta de nuevo."}
      {state === "retry" && <button type="button" className="ml-3 underline" onClick={() => {
        setState("loading");
        setAttempt((value) => value + 1);
      }}>Reintentar</button>}
      {state === "forbidden" && <a className="ml-3 underline" href="/login">Ir al inicio de sesión</a>}
    </div>
  </main>;
}
