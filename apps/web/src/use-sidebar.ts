import { useCallback, useEffect, useState } from "react";
import { save, saved } from "./preferences.ts";

// React owns both the desktop preferences and the temporary mobile overlay.
export function useSidebar() {
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 1011px)").matches,
  );
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => saved("sidebar-collapsed") === "true",
  );
  const [width, setWidthState] = useState(() => {
    const width = Number(saved("sidebar-width"));
    return width >= 200 && width <= 520 ? width : 330;
  });
  useEffect(() => {
    const media = matchMedia("(max-width: 1011px)");
    const update = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    media.addEventListener("change", update);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    const main = document.querySelector<HTMLElement>("main");
    const header = document.querySelector<HTMLElement>(".topbar");
    const sidebar = document.querySelector<HTMLElement>("#sidebar");
    main?.setAttribute("inert", "");
    header?.setAttribute("inert", "");
    const focusable = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    requestAnimationFrame(() => focusable()[0]?.focus());
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      main?.removeAttribute("inert");
      header?.removeAttribute("inert");
      document.querySelector<HTMLElement>("#sidebar-toggle")?.focus();
    };
  }, [mobile, open]);
  useEffect(() => {
    save("sidebar-collapsed", String(collapsed));
  }, [collapsed]);
  useEffect(() => {
    save("sidebar-width", String(width));
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  }, [width]);
  useEffect(
    () => () => {
      document.body.classList.remove("resizing-sidebar");
    },
    [],
  );
  const show = useCallback(() => {
    if (mobile) setOpen(true);
    else setCollapsed(false);
  }, [mobile]);
  const closeMobile = useCallback(() => setOpen(false), []);
  return {
    mobile,
    open,
    collapsed,
    width,
    show,
    closeMobile,
    expanded: mobile ? open : !collapsed,
    toggle: () => {
      if (mobile) setOpen((value) => !value);
      else setCollapsed((value) => !value);
    },
    setWidth: (next: number) =>
      setWidthState(
        Math.max(200, Math.min(520, window.innerWidth - 320, next)),
      ),
  };
}
