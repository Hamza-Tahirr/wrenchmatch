"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { ThemeToggle } from "@/components/theme";
import { Logo } from "./logo";

type SheetState = "closed" | "open" | "closing";

/** Longest the slide-out may take before the dialog is closed anyway (transitionend can be skipped). */
const CLOSE_FALLBACK_MS = 420;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Keeps the page behind the sheet from scrolling (iOS included); returns the undo function. */
function lockPageScroll(): () => void {
  const root = document.documentElement;
  const { body } = document;
  const previous = { root: root.style.overflow, body: body.style.overflow, gutter: root.style.scrollbarGutter };
  root.style.scrollbarGutter = "stable";
  root.style.overflow = "hidden";
  body.style.overflow = "hidden";
  return () => {
    root.style.overflow = previous.root;
    body.style.overflow = previous.body;
    root.style.scrollbarGutter = previous.gutter;
  };
}

export type MobileMenuProps = {
  /** The sheet's scrolling content (rendered on the server): account card, navigation, actions. */
  children: ReactNode;
  /**
   * Optional row pinned to the bottom of the sheet, e.g. the Log out form. When given, the
   * theme toggle sits right beside it; otherwise the toggle is in the sheet's top bar.
   */
  footer?: ReactNode;
};

/**
 * Small-screen navigation (hidden from lg up): a "Menu" button that opens a slide-in sheet.
 * The sheet is a native modal <dialog> in the top layer, so the header's blur can't trap it:
 * the rest of the page is inert and focus stays inside. Escape, the close button, a tap on
 * the backdrop, any link inside, focus leaving and every route change close it; the page
 * behind doesn't scroll; focus returns to the Menu button. Transform/opacity transitions
 * only, instant under reduced motion.
 */
export function MobileMenu({ children, footer }: MobileMenuProps) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const unlockRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const [state, setState] = useState<SheetState>("closed");
  const panelId = useId();
  const titleId = `${panelId}-title`;

  const finishClose = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    closingRef.current = false;
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    unlockRef.current?.();
    unlockRef.current = null;
    setState("closed");
  }, []);

  const close = useCallback(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!dialog?.open || closingRef.current) return;
    if (!panel || prefersReducedMotion()) {
      finishClose();
      return;
    }
    closingRef.current = true;
    setState("closing");
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== panel || event.propertyName !== "transform") return;
      panel.removeEventListener("transitionend", onEnd);
      finishClose();
    };
    panel.addEventListener("transitionend", onEnd);
    timerRef.current = window.setTimeout(() => {
      panel.removeEventListener("transitionend", onEnd);
      finishClose();
    }, CLOSE_FALLBACK_MS);
  }, [finishClose]);

  function openSheet() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    closeButtonRef.current?.focus({ preventScroll: true });
    unlockRef.current = lockPageScroll();
    // Commit the off-screen start position so the sheet slides in.
    panelRef.current?.getBoundingClientRect();
    setState("open");
  }

  // Any route change closes the sheet (links inside also close it as they are followed).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    close();
  }, [pathname, close]);

  // Never leave the page locked if the header unmounts while the sheet is open.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      unlockRef.current?.();
    },
    [],
  );

  // The sheet is for small screens only: close it if the window grows past lg.
  useEffect(() => {
    if (state === "closed") return;
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (query.matches) finishClose();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [state, finishClose]);

  function onPanelClick(event: MouseEvent<HTMLDivElement>) {
    // Delegated: following any link inside (mouse, touch or keyboard) closes the sheet.
    if (event.target instanceof Element && event.target.closest("a[href]")) close();
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={state === "open"}
        aria-controls={panelId}
        onClick={openSheet}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset transition-[background-color,box-shadow,transform] duration-200 hover:bg-fg/[0.06] active:scale-[0.97] aria-expanded:bg-fg/[0.08] aria-expanded:shadow-glow-sm"
      >
        <Menu aria-hidden="true" className="size-5" />
        Menu
      </button>
      <dialog
        ref={dialogRef}
        id={panelId}
        aria-labelledby={titleId}
        data-state={state}
        onCancel={(event) => {
          // Escape: slide out instead of disappearing at once.
          event.preventDefault();
          close();
        }}
        onClose={() => {
          if (unlockRef.current) finishClose();
        }}
        onBlur={(event) => {
          // Focus moving outside the sheet closes it (not the window losing focus).
          const next = event.relatedTarget;
          if (next instanceof Node && !event.currentTarget.contains(next)) close();
        }}
        className="group/sheet fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0 text-fg backdrop:bg-transparent backdrop:backdrop-blur-none"
      >
        <div
          aria-hidden="true"
          onClick={close}
          className="absolute inset-0 bg-[oklch(0.13_0.03_266/0.55)] opacity-0 transition-opacity duration-300 ease-out group-data-[state=open]/sheet:opacity-100"
        />
        <div
          ref={panelRef}
          className="absolute inset-y-0 right-0 flex w-[min(23rem,calc(100%-2.75rem))] translate-x-full flex-col border-l border-line-strong bg-elevated shadow-[-28px_0_64px_-28px_oklch(0.1_0.03_266/0.5)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform group-data-[state=open]/sheet:translate-x-0 motion-reduce:transition-none"
        >
          {/* Soft neon wash at the top of the sheet (decorative, painted once). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(90%_100%_at_100%_0%,color-mix(in_oklab,var(--color-neon-violet)_16%,transparent),transparent_70%),radial-gradient(70%_80%_at_0%_0%,color-mix(in_oklab,var(--color-neon-cyan)_11%,transparent),transparent_70%)]"
          />
          <div className="relative box-content flex h-16 shrink-0 items-center gap-2 border-b border-line pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-4">
            <h2 id={titleId} className="sr-only">
              Menu
            </h2>
            <div onClick={onPanelClick} className="mr-auto">
              <Logo />
            </div>
            {/* The theme toggle lives here unless a footer row holds it (or the content brings one). */}
            {footer ? null : (
              <div className="group-has-[[data-sheet-body]_.wm-theme-toggle]/sheet:hidden">
                <ThemeToggle className="ring-1 ring-line ring-inset" />
              </div>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={close}
              className="grid size-11 place-items-center rounded-xl text-fg-muted ring-1 ring-line ring-inset transition-[background-color,color,transform] duration-200 hover:bg-fg/[0.07] hover:text-fg active:scale-95"
            >
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Close navigation</span>
            </button>
          </div>
          <div
            data-sheet-body=""
            onClick={onPanelClick}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]"
          >
            {children}
          </div>
          {footer ? (
            <div
              onClick={onPanelClick}
              className="relative flex shrink-0 items-center gap-2.5 border-t border-line px-4 pt-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <div className="min-w-0 flex-1">{footer}</div>
              <ThemeToggle className="ring-1 ring-line-strong ring-inset" />
            </div>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
