import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

type MobileNavigation = {
  readonly mobileOpen: boolean;
  readonly setMobileOpen: (open: boolean) => void;
  readonly closeRef: RefObject<HTMLButtonElement | null>;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly drawerRef: RefObject<HTMLElement | null>;
};

export function useMobileNavigation(): MobileNavigation {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const previousBodyOverflowRef = useRef("");
  const hasOpenedMobileRef = useRef(false);

  useEffect(() => {
    if (!mobileOpen) {
      if (hasOpenedMobileRef.current) triggerRef.current?.focus();
      return;
    }

    hasOpenedMobileRef.current = true;
    previousBodyOverflowRef.current = document.body.style.overflow;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousBodyOverflowRef.current;
    };
  }, [mobileOpen]);

  return { mobileOpen, setMobileOpen, closeRef, triggerRef, drawerRef };
}
