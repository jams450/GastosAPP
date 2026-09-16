"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        setError("Credenciales inválidas");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="tabler-page relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      <div className="tabler-page-gradient" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-shell-glow)] opacity-20 blur-3xl" aria-hidden="true" />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-[calc(var(--radius-lg)+0.5rem)] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-shell-bg)_74%,transparent)] p-1.5 shadow-[var(--shadow-md)] backdrop-blur-xl">
        <Card className="w-full space-y-7 border-[var(--color-border-accent)] bg-[color-mix(in_srgb,var(--color-surface-1)_90%,transparent)] p-6 sm:p-8">
          <header className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="shell-brand-mark inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-sm font-black tracking-[-0.12em]">AM</span>
              <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Amitzi Finance</p><p className="mt-1 text-xs text-muted">Tu dinero, claro.</p></div>
            </div>
            <div className="space-y-2">
              <p className="shell-page-kicker">Acceso privado</p>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-primary">Bienvenido de vuelta</h1>
              <p className="max-w-sm text-sm leading-6 text-muted">Ingresa para recuperar el pulso de tus cuentas y movimientos.</p>
            </div>
          </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            type="text"
            required
            autoComplete="username"
            placeholder="ej. demo"
          />

          <Input
            label="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            rightSlot={
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPassword((value) => !value)}
                className="h-7 rounded-lg px-2.5 text-xs"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </Button>
            }
          />

          {error ? <Alert variant="danger">{error}</Alert> : null}

          <Button type="submit" fullWidth loading={loading} loadingText="Ingresando...">
            Ingresar
          </Button>
        </form>
        </Card>
      </div>
    </main>
  );
}
