"use client";

import { MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/ui/cn";

type RowActionsMenuProps = {
  /** Nombre accesible del disparador y del panel. */
  label: string;
  children: ReactNode;
};

const PANEL_WIDTH = 208;
/** Alto estimado del panel para decidir si se abre hacia arriba. */
const PANEL_ESTIMATED_HEIGHT = 288;
const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 6;

type MenuPosition = { top: number; left: number };

/**
 * Menú de acciones de fila para el rango de 640–1024px y para las tarjetas.
 *
 * El panel se renderiza en un portal sobre `document.body` con posición `fixed`: el
 * contenedor de la tabla usa `overflow-x-auto`, que también recorta el eje vertical, así
 * que un desplegable absoluto dentro de la celda quedaría cortado. El portal escapa de
 * ese recorte sin tocar el layout de la tabla.
 *
 * Cierra con Escape (devolviendo el foco al disparador), con clic fuera, al elegir una
 * acción y cuando la ventana cambia de tamaño o se desplaza, porque en esos casos la
 * posición calculada deja de ser válida.
 */
export function RowActionsMenu({ label, children }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const openMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const below = rect.bottom + TRIGGER_GAP;
    const above = rect.top - PANEL_ESTIMATED_HEIGHT - TRIGGER_GAP;
    const overflowsBelow = below + PANEL_ESTIMATED_HEIGHT > window.innerHeight - VIEWPORT_MARGIN;
    const top = overflowsBelow && above >= VIEWPORT_MARGIN ? above : below;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - PANEL_WIDTH),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN)
    );

    setPosition({ top, left });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      close(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    }

    function handleViewportChange() {
      close(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
    );
    firstFocusable?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        title={label}
        onClick={() => (open ? close(false) : openMenu())}
        className="table-action inline-flex h-8 w-8 shrink-0 items-center justify-center border px-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="group"
              aria-label={label}
              style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
              className={cn(
                "fixed z-[80] flex flex-col gap-1 rounded-[var(--radius-md)] p-1.5",
                "border border-strong bg-[var(--color-surface-1)] shadow-[var(--shadow-md)]",
                "[&_a]:w-full [&_a]:justify-start [&_button]:w-full [&_button]:justify-start"
              )}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("button, a")) {
                  close(true);
                }
              }}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
