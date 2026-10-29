"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/navigation/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { parseApiError } from "@/lib/bff/client-session";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  PREVIEW_OUTCOME_LABELS,
  PREVIEW_REASON_LABELS,
  normalizeMailboxes,
  normalizePreviewResult
} from "@/lib/contracts/email-preview";
import type { EmailPreviewMessageInput, EmailPreviewResult } from "@/lib/contracts/email-preview";

type Props = { username: string };

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("es-MX");
}

/**
 * Fecha local en formato `yyyy-MM-dd`. No se usa `toISOString()` a propósito: convierte a UTC, y en
 * una zona negativa como México (UTC-6) un "últimos 7 días" por la tarde empezaría un día antes o
 * después del que el usuario ve en el calendario.
 */
function localDay(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function PreviewClient({ username }: Props) {
  const [messages, setMessages] = useState<EmailPreviewMessageInput[]>([]);
  const [senderAddress, setSenderAddress] = useState("");
  const [subject, setSubject] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [maxItems, setMaxItems] = useState("50");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mailbox, setMailbox] = useState("");
  const [mailboxes, setMailboxes] = useState<string[]>([]);
  const [mailboxMessage, setMailboxMessage] = useState<string | null>(null);
  const [loadingMailboxes, setLoadingMailboxes] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmailPreviewResult | null>(null);

  // Los buzones se cargan al entrar: si la conexión no está configurada, la pantalla lo dice en vez
  // de ofrecer un selector vacío que parece un fallo.
  useEffect(() => {
    let cancelled = false;

    async function loadMailboxes() {
      try {
        const response = await fetch("/api/bff/mail/mailboxes", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("No se pudieron leer los buzones");
        }

        const parsed = normalizeMailboxes(await response.json());
        if (cancelled) {
          return;
        }

        setMailboxes(parsed.mailboxes);
        setMailboxMessage(parsed.message);
        setMailbox(parsed.mailboxes.includes("INBOX") ? "INBOX" : (parsed.mailboxes[0] ?? ""));
      } catch (err) {
        if (!cancelled) {
          setMailboxMessage(err instanceof Error ? err.message : "No se pudieron leer los buzones");
        }
      } finally {
        if (!cancelled) {
          setLoadingMailboxes(false);
        }
      }
    }

    void loadMailboxes();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }

    const loaded: EmailPreviewMessageInput[] = [];
    for (const file of files) {
      loaded.push({ name: file.name, raw: await file.text() });
    }

    setMessages((current) => [...current, ...loaded]);
  }

  function removeMessage(index: number) {
    setMessages((current) => current.filter((_, position) => position !== index));
  }

  function applyQuickRange(days: number) {
    setFrom(localDay(-days));
    setTo(localDay(0));
  }

  async function run() {
    setRunning(true);
    setError(null);

    try {
      const response = await csrfFetch("/api/bff/mail/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          candidates:
            senderAddress.trim().length > 0 || subject.trim().length > 0
              ? [{ name: "candidato manual", senderAddress, subject, receivedAt: receivedAt || null }]
              : [],
          maxItems: Number(maxItems.trim() === "" ? "50" : maxItems),
          from: from || null,
          to: to || null,
          mailbox: mailbox || null
        })
      });

      if (!response.ok) {
        throw await parseApiError(response, "No se pudo probar el clasificador");
      }

      setResult(normalizePreviewResult(await response.json()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo probar el clasificador");
    } finally {
      setRunning(false);
    }
  }

  const hasInput =
    messages.length > 0 || senderAddress.trim().length > 0 || subject.trim().length > 0 || mailbox.length > 0;

  return (
    <>
      <PageHeader
        section="Correo"
        title="Módulo de prueba"
        subtitle="Clasifica una muestra con las reglas actuales. No registra mensajes ni crea borradores."
        variant="plain"
      />

      <section className="space-y-3">
        <Card className="space-y-3 p-4">
          <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Mensajes .eml</h4>
          <p className="text-muted text-xs">
            Se leen solo las cabeceras (remitente, asunto y fecha), que es lo que el clasificador mira.
          </p>
          <input
            type="file"
            multiple
            accept=".eml,message/rfc822,text/plain"
            onChange={(event) => void onFilesSelected(event)}
            className="text-secondary text-xs"
          />
          {messages.length > 0 ? (
            <ul className="space-y-1">
              {messages.map((message, index) => (
                <li key={`${message.name}-${index}`} className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-1">
                  <span className="text-secondary truncate text-xs">{message.name}</span>
                  <Button type="button" variant="ghost" onClick={() => removeMessage(index)} aria-label={`Quitar ${message.name}`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-xs">Sin mensajes cargados.</p>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Candidato manual</h4>
          <p className="text-muted text-xs">Para probar una regla sin tener un correo a la vista.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Remitente"
              value={senderAddress}
              onChange={(event) => setSenderAddress(event.target.value)}
              placeholder="notificaciones@banco.com"
              className="input-semantic rounded-none placeholder:text-muted"
            />
            <Input
              label="Asunto"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Cargo por $123.00"
              className="input-semantic rounded-none placeholder:text-muted"
            />
            <Input
              label="Recibido"
              type="date"
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
              className="input-semantic rounded-none placeholder:text-muted"
            />
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Buzón (IMAP)</h4>
          {loadingMailboxes ? (
            <p className="text-muted text-xs">Leyendo buzones...</p>
          ) : mailboxes.length > 0 ? (
            <>
              <p className="text-muted text-xs">
                Lee los mensajes más recientes del buzón elegido. Solo lectura: no marca leídos, no etiqueta y
                no mueve nada.
              </p>
              <Select label="Buzón o etiqueta" value={mailbox} onChange={(event) => setMailbox(event.target.value)}>
                <option value="">Sin buzón (solo lo cargado a mano)</option>
                {mailboxes.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </>
          ) : (
            <p className="text-muted text-xs">
              {mailboxMessage ??
                "Sin conexión IMAP. Configura Email__Imap__Username y Email__Imap__Password (contraseña de aplicación) para leer el buzón desde aquí."}
            </p>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Muestra y rango de fechas</h4>
          <p className="text-muted text-xs">
            El rango se aplica al buzón por IMAP (SINCE/BEFORE sobre la fecha de entrega) y también descarta
            los candidatos escritos a mano que caigan fuera. Sin fechas, se toman los mensajes más recientes
            hasta el tope.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted text-[11px]">Rango rápido:</span>
            {[7, 30, 90].map((days) => (
              <Button
                key={days}
                type="button"
                variant="secondary"
                className="h-7 rounded-none px-2 text-[11px] font-bold"
                onClick={() => applyQuickRange(days)}
              >
                Últimos {days} días
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              className="h-7 rounded-none px-2 text-[11px] font-bold"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Sin rango
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Tope de la muestra"
              type="number"
              min={1}
              max={200}
              value={maxItems}
              onChange={(event) => setMaxItems(event.target.value)}
              className="input-semantic rounded-none placeholder:text-muted"
            />
            <Input
              label="Desde"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="input-semantic rounded-none placeholder:text-muted"
            />
            <Input
              label="Hasta"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="input-semantic rounded-none placeholder:text-muted"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="primary" onClick={() => void run()} disabled={running || !hasInput}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              <span>{running ? "Probando..." : "Probar clasificador"}</span>
            </Button>
            {username ? <span className="text-muted text-[11px]">Sesión de {username}</span> : null}
          </div>
          {error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}
        </Card>

        {result ? (
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Veredictos</h4>
              <span className="text-muted text-xs">Total {result.total}</span>
              <span className="text-muted text-xs">Mostrados {result.returned}</span>
              {result.unreadable > 0 ? <span className="text-muted text-xs">Ilegibles {result.unreadable}</span> : null}
              {result.skippedOutOfRange > 0 ? (
                <span className="text-muted text-xs">Fuera de rango {result.skippedOutOfRange}</span>
              ) : null}
              {result.skippedByLimit > 0 ? <span className="text-muted text-xs">Sobre el tope {result.skippedByLimit}</span> : null}
              {result.dropOlderThanDays > 0 ? (
                <span className="text-muted text-xs">Corte {result.dropOlderThanDays} días</span>
              ) : (
                <span className="text-muted text-xs">Sin corte de antigüedad</span>
              )}
            </div>

            {result.rows.length === 0 ? (
              <p className="text-muted text-xs">Sin mensajes en la muestra.</p>
            ) : (
              <div className="app-grid-skin app-grid-skin-flat overflow-x-auto rounded-none p-0">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead>
                    <tr className="text-muted">
                      <th className="px-3 py-2 font-semibold">Mensaje</th>
                      <th className="px-3 py-2 font-semibold">Remitente</th>
                      <th className="px-3 py-2 font-semibold">Asunto</th>
                      <th className="px-3 py-2 font-semibold">Recibido</th>
                      <th className="px-3 py-2 font-semibold">Veredicto</th>
                      <th className="px-3 py-2 font-semibold">Etiqueta</th>
                      <th className="px-3 py-2 font-semibold">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, index) => (
                      <tr key={`${row.name}-${index}`} className="border-t border-[var(--color-border)]">
                        <td className="text-secondary px-3 py-2">{row.name}</td>
                        <td className="text-secondary px-3 py-2 font-mono">{row.senderAddress ?? "—"}</td>
                        <td className="text-primary px-3 py-2">{row.subject ?? "—"}</td>
                        <td className="text-muted px-3 py-2">{formatDate(row.receivedAt)}</td>
                        <td className="text-primary px-3 py-2">{PREVIEW_OUTCOME_LABELS[row.outcome] ?? row.outcome}</td>
                        <td className="text-secondary px-3 py-2">{row.labelSlug ?? "—"}</td>
                        <td className="text-muted px-3 py-2">
                          {PREVIEW_REASON_LABELS[row.reason] ?? row.reason}
                          {row.matchedRuleName ? ` · ${row.matchedRuleName}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}
      </section>
    </>
  );
}
