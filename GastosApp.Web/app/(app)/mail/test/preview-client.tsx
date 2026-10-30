"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  EMAIL_APPLY_STATUS_LABELS,
  PREVIEW_OUTCOME_LABELS,
  PREVIEW_REASON_LABELS,
  normalizeApplyResult,
  normalizeMailboxes,
  normalizePreviewResult
} from "@/lib/contracts/email-preview";
import type { EmailApplyResult, EmailPreviewMessageInput, EmailPreviewResult } from "@/lib/contracts/email-preview";

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
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmailPreviewResult | null>(null);
  const [applyResult, setApplyResult] = useState<EmailApplyResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  // El token se consume al intentar aplicar, incluso si la red falló: no puede quedar un reintento
  // automático con un resultado incierto.
  const [applyAttempted, setApplyAttempted] = useState(false);
  // Huella de los insumos con los que se generó la muestra, y de si esa muestra pidió un buzón.
  const [resultFingerprint, setResultFingerprint] = useState<string | null>(null);
  const [resultMailbox, setResultMailbox] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  // Además del estado `disabled`, dos guardas por referencia: un doble clic no puede abrir dos
  // peticiones (ni dos vistas previas ni dos aplicaciones) antes de que React re-renderice.
  const previewInFlight = useRef(false);
  const applyInFlight = useRef(false);

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

  const requestPayload = useMemo(
    () => ({
      messages,
      candidates:
        senderAddress.trim().length > 0 || subject.trim().length > 0
          ? [{ name: "candidato manual", senderAddress, subject, receivedAt: receivedAt || null }]
          : [],
      maxItems: Number(maxItems.trim() === "" ? "50" : maxItems),
      from: from || null,
      to: to || null,
      mailbox: mailbox || null
    }),
    [messages, senderAddress, subject, receivedAt, maxItems, from, to, mailbox]
  );

  // Huella barata de los insumos: el texto crudo de los .eml no entra, porque solo cambia al agregar
  // o quitar un archivo y su nombre ya está en la lista.
  const fingerprint = useMemo(
    () =>
      JSON.stringify({
        ...requestPayload,
        messages: requestPayload.messages.map((message) => message.name)
      }),
    [requestPayload]
  );

  async function run() {
    if (previewInFlight.current || applyInFlight.current) {
      return;
    }

    previewInFlight.current = true;
    setRunning(true);
    setError(null);
    // Un resultado anterior no sobrevive a una muestra nueva: su token y sus conteos describen otra
    // consulta. Se limpia antes de pedir, así que una vista previa fallida tampoco deja nada aplicable.
    setResult(null);
    setApplyResult(null);
    setApplyError(null);
    setApplyAttempted(false);
    setResultFingerprint(null);
    setResultMailbox(null);

    const requestedFingerprint = fingerprint;
    const requestedMailbox = requestPayload.mailbox;

    try {
      const response = await csrfFetch("/api/bff/mail/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw await parseApiError(response, "No se pudo probar el clasificador");
      }

      setResult(normalizePreviewResult(await response.json()));
      setResultFingerprint(requestedFingerprint);
      setResultMailbox(requestedMailbox);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo probar el clasificador");
    } finally {
      previewInFlight.current = false;
      setRunning(false);
    }
  }

  async function applyLabels() {
    const token = result?.applyToken ?? null;
    const expiresAt = result?.applyExpiresAt ? Date.parse(result.applyExpiresAt) : Number.NaN;
    if (
      token === null || applyInFlight.current || previewInFlight.current || applyAttempted ||
      resultFingerprint !== fingerprint || !Number.isFinite(expiresAt) || expiresAt <= Date.now()
    ) {
      return;
    }

    const confirmed = window.confirm(
      `¿Agregar la etiqueta existente a ${result?.applicableCount ?? 0} mensaje(s) de esta muestra?\n\n` +
        "Solo se agrega la etiqueta del catálogo cuando su nombre coincide exactamente con la del buzón. " +
        "No se crean etiquetas, no se mueve correo y no se borra nada."
    );
    if (!confirmed) {
      return;
    }

    applyInFlight.current = true;
    setApplying(true);
    setApplyError(null);
    setApplyAttempted(true);

    try {
      const response = await csrfFetch("/api/bff/mail/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        throw await parseApiError(response, "No se pudo aplicar la muestra al buzón");
      }

      const normalized = normalizeApplyResult(await response.json());
      if (normalized === null) {
        throw new Error("El servidor respondió algo que no se pudo leer y no se puede confirmar qué se etiquetó.");
      }

      setApplyResult(normalized);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "No se pudo aplicar la muestra al buzón");
    } finally {
      applyInFlight.current = false;
      setApplying(false);
    }
  }

  // El permiso dura 15 minutos: se refresca el reloj solo mientras hay un vencimiento en pantalla,
  // para que el botón se apague en vez de fallar con un token vencido.
  useEffect(() => {
    if (!result?.applyExpiresAt) {
      return;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [result?.applyExpiresAt]);

  const hasInput =
    messages.length > 0 || senderAddress.trim().length > 0 || subject.trim().length > 0 || mailbox.length > 0;

  // Mientras corre cualquiera de las dos acciones se apagan los insumos y las dos acciones: una
  // vista previa nueva en medio de una aplicación reemplazaría el token que se está consumiendo.
  const busy = running || applying;

  // El token solo vale para la muestra que describe los insumos actuales. Si algo cambió después de
  // la vista previa, el botón se apaga en vez de aplicar otra consulta.
  const applyIsStale = result !== null && resultFingerprint !== fingerprint;
  const expiryMs = result?.applyExpiresAt ? Date.parse(result.applyExpiresAt) : Number.NaN;
  const applyExpired = now > 0 && Number.isFinite(expiryMs) && expiryMs <= now;
  const applyAvailable =
    result !== null && result.applyToken !== null && result.applicableCount > 0 && !applyIsStale && !applyAttempted;

  return (
    <>
      <PageHeader
        section="Correo"
        title="Módulo de prueba"
        subtitle="Clasifica una muestra con las reglas actuales. La vista previa no escribe en el correo ni en la base de datos; solo «Aplicar etiquetas» agrega etiquetas existentes a la muestra revisada."
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
            disabled={busy}
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
              disabled={busy}
              className="input-semantic rounded-none placeholder:text-muted"
            />
            <Input
              label="Asunto"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Cargo por $123.00"
              disabled={busy}
              className="input-semantic rounded-none placeholder:text-muted"
            />
            <Input
              label="Recibido"
              type="date"
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
              disabled={busy}
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
                Lee los mensajes más recientes del buzón elegido. Leer no marca nada: la vista previa no marca
                leídos ni etiqueta. Etiquetar es una acción aparte, con confirmación, sobre lo que acabas de
                revisar.
              </p>
              <Select
                label="Buzón o etiqueta"
                value={mailbox}
                onChange={(event) => setMailbox(event.target.value)}
                disabled={busy}
              >
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
                disabled={busy}
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
              disabled={busy}
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
              disabled={busy}
              className="input-semantic rounded-none placeholder:text-muted"
            />
            <Input
              label="Desde"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              disabled={busy}
              className="input-semantic rounded-none placeholder:text-muted"
            />
            <Input
              label="Hasta"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              disabled={busy}
              className="input-semantic rounded-none placeholder:text-muted"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="primary" onClick={() => void run()} disabled={busy || !hasInput}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              <span>{running ? "Probando..." : "Probar clasificador"}</span>
            </Button>
            {username ? <span className="text-muted text-[11px]">Sesión de {username}</span> : null}
          </div>
          {/* Aviso de costo explícito: probar la muestra puede llamar al modelo y esa llamada se
              factura. Son dos caminos distintos y conviene no confundirlos: una regla con acción
              «LLM» decide por el modelo aunque el respaldo automático esté apagado; el respaldo de
              «ninguna regla» solo ocurre si Email:LlmFallbackEnabled está encendido. */}
          <p className="text-muted text-xs">
            Esta prueba puede llamar al LLM y esas llamadas se facturan: lo hace cuando una regla con
            acción «LLM» decide el correo (aunque el respaldo automático esté apagado) y, solo si
            Email__LlmFallbackEnabled está encendido, también cuando ninguna regla coincide. Cada
            corrida gasta como máximo Email__LlmMaxPerRun llamadas (20 por defecto; 0 las apaga) y todas
            las fallas terminan en revisión, sin etiquetar. Aun así la vista previa no escribe en el
            buzón ni en la base de datos.
          </p>
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
              {result.skippedAlreadyLabelled > 0 ? (
                <span className="text-muted text-xs">Ya etiquetados: {result.skippedAlreadyLabelled}</span>
              ) : null}
              {result.dropOlderThanDays > 0 ? (
                <span className="text-muted text-xs">Corte {result.dropOlderThanDays} días</span>
              ) : (
                <span className="text-muted text-xs">Sin corte de antigüedad</span>
              )}
            </div>

            {/* Las filas que ya traían su etiqueta destino se leyeron y se clasificaron, pero no se
                listan: el plan tampoco las incluye, porque aplicarlas repetiría lo ya hecho. */}
            {result.skippedAlreadyLabelled > 0 ? (
              <p className="text-muted text-xs">
                {result.skippedAlreadyLabelled === 1 ? "Un mensaje" : `${result.skippedAlreadyLabelled} mensajes`}{" "}
                de esta muestra ya tenía{result.skippedAlreadyLabelled === 1 ? "" : "n"} la etiqueta destino de su
                regla, así que quedó fuera de la lista revisada y tampoco entra al plan de aplicar: no hay nada
                que hacer sobre él. Sigue contado en el total porque sí se leyó y se clasificó.
              </p>
            ) : null}

            {/* Aplicar solo toca la muestra que está en pantalla. No hay búsqueda nueva: el plan lo
                guardó el servidor cuando se generó esta vista previa y se consume una sola vez. */}
            <div className="space-y-2 border border-[var(--color-border)] p-3">
              <h5 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Aplicar etiquetas</h5>

              {applyAvailable ? (
                <>
                  <p className="text-secondary text-xs">
                    Esta muestra tiene {result.applicableCount}{" "}
                    {result.applicableCount === 1 ? "mensaje" : "mensajes"} con etiqueta. Al aplicar se agrega la
                    etiqueta <b>ya existente</b> del catálogo, solo si su nombre coincide exactamente con la
                    etiqueta del buzón: no se crean etiquetas, no se mueve ni se borra correo, y los demás
                    mensajes de la muestra no se tocan.
                  </p>
                  {result.applyExpiresAt ? (
                    <p className="text-muted text-xs">
                      El permiso para aplicar vence {formatDate(result.applyExpiresAt)}.
                    </p>
                  ) : null}
                  <Button type="button" variant="primary" onClick={() => void applyLabels()} disabled={applying || applyExpired}>
                    {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                    <span>{applying ? "Aplicando..." : "Aplicar etiquetas"}</span>
                  </Button>
                  {applyExpired ? (
                    <p className="text-xs text-[var(--color-warning)]">
                      El permiso venció. Genera una vista previa nueva para aplicar.
                    </p>
                  ) : null}
                </>
              ) : null}

              {result.applyToken !== null && applyIsStale ? (
                <p className="text-xs text-[var(--color-warning)]">
                  La muestra o la configuración cambió desde la vista previa. Genera una vista previa nueva para
                  aplicar: no se etiqueta con datos de otra consulta.
                </p>
              ) : null}

              {result.applyToken === null && resultMailbox === null ? (
                <p className="text-muted text-xs">
                  La muestra no vino del buzón: los archivos .eml y los candidatos escritos a mano se quedan en
                  simulación y nunca se etiquetan.
                </p>
              ) : null}

              {result.applyToken === null && resultMailbox !== null ? (
                <p className="text-muted text-xs">
                  Ningún mensaje de esta muestra quedó con etiqueta, así que no hay nada que aplicar.
                </p>
              ) : null}

              {applyError ? (
                <p className="text-xs text-[var(--color-danger)]">
                  {applyError} El permiso de esta muestra ya se consumió: genera una vista previa nueva y revisa el
                  buzón antes de volver a intentarlo.
                </p>
              ) : null}

              {applyResult ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-muted text-xs">Etiquetados {applyResult.applied}</span>
                    <span className="text-muted text-xs">Omitidos {applyResult.skipped}</span>
                    <span className="text-muted text-xs">Fallidos {applyResult.failed}</span>
                  </div>
                  <div className="app-grid-skin app-grid-skin-flat overflow-x-auto rounded-none p-0">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead>
                        <tr className="text-muted">
                          <th className="px-3 py-2 font-semibold">Mensaje</th>
                          <th className="px-3 py-2 font-semibold">Etiqueta</th>
                          <th className="px-3 py-2 font-semibold">Estado</th>
                          <th className="px-3 py-2 font-semibold">Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {applyResult.rows.map((row, index) => (
                          <tr key={`${row.name}-${index}`} className="border-t border-[var(--color-border)]">
                            <td className="text-secondary px-3 py-2">{row.name}</td>
                            <td className="text-secondary px-3 py-2">{row.label || "—"}</td>
                            <td
                              className={`px-3 py-2 ${
                                row.status === "applied"
                                  ? "text-[var(--color-success)]"
                                  : row.status === "failed"
                                    ? "text-[var(--color-danger)]"
                                    : "text-muted"
                              }`}
                            >
                              {EMAIL_APPLY_STATUS_LABELS[row.status]}
                            </td>
                            <td className="text-muted px-3 py-2">{row.message || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
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
