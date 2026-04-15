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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-white to-sky-100 px-4 py-12 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.2),transparent_30%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.2),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.14),transparent_30%)]" />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <Card className="relative z-10 w-full max-w-md space-y-6 border-slate-200/70 bg-white/90 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/85 dark:shadow-slate-950/60">
        <header className="space-y-2 text-center">
          <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300">
            GastosApp
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Inicia sesión</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Ingresa con tus credenciales para continuar al dashboard.</p>
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
    </main>
  );
}
