"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/security/csrf-client";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    try {
      await csrfFetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={onLogout}
      variant="secondary"
      loading={loading}
      loadingText="Saliendo..."
      className="h-10 px-4 text-sm"
    >
      Cerrar sesión
    </Button>
  );
}
