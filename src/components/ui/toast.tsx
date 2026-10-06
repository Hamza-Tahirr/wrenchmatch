"use client";

import { CircleCheck, CircleX, Info, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { cn } from "@/lib/cn";

// Toasts: transient confirmations ("Quote sent"). Call toast.success / toast.error / toast.info
// / toast.warning from any Client Component; the root layout renders one <Toaster />. They
// are announced through persistent live regions (errors assertively), pause while hovered or
// focused, and never carry the only copy of important information: keep inline errors and
// page state as the source of truth.

export type ToastTone = "success" | "error" | "info" | "warning";

export type ToastOptions = {
  description?: string;
  /** Milliseconds before it hides (default 5000, errors 8000). */
  duration?: number;
  /** An optional link, e.g. { label: "View booking", href: "/bookings/abc" }. */
  action?: { label: string; href: string };
};

type ToastRecord = ToastOptions & { id: number; tone: ToastTone; title: string };

type Listener = () => void;

const MAX_TOASTS = 4;
const EMPTY: ToastRecord[] = [];
const listeners = new Set<Listener>();
let records: ToastRecord[] = EMPTY;
let nextId = 1;

function emit() {
  for (const listener of listeners) listener();
}

function push(tone: ToastTone, title: string, options: ToastOptions = {}): number {
  const id = nextId++;
  records = [...records, { ...options, id, tone, title }].slice(-MAX_TOASTS);
  emit();
  return id;
}

function dismiss(id?: number) {
  records = id === undefined ? EMPTY : records.filter((record) => record.id !== id);
  emit();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type ToastApi = {
  (title: string, options?: ToastOptions & { tone?: ToastTone }): number;
  success: (title: string, options?: ToastOptions) => number;
  error: (title: string, options?: ToastOptions) => number;
  info: (title: string, options?: ToastOptions) => number;
  warning: (title: string, options?: ToastOptions) => number;
  /** Dismisses one toast, or all of them without an id. */
  dismiss: (id?: number) => void;
};

export const toast: ToastApi = Object.assign(
  (title: string, options?: ToastOptions & { tone?: ToastTone }) => push(options?.tone ?? "info", title, options),
  {
    success: (title: string, options?: ToastOptions) => push("success", title, options),
    error: (title: string, options?: ToastOptions) => push("error", title, options),
    info: (title: string, options?: ToastOptions) => push("info", title, options),
    warning: (title: string, options?: ToastOptions) => push("warning", title, options),
    dismiss,
  },
);

/** The common Server Action result shapes in this app. */
export type ActionStateLike = {
  ok: boolean;
  message?: string | null;
  formError?: string | null;
} | null;

/**
 * Shows a toast whenever a `useActionState` result changes: `state.message` (or
 * `options.success`) on success, `state.formError` (or `options.error`) on failure. The
 * initial state never toasts.
 *
 *   const [state, formAction] = useActionState(saveProfile, initialState);
 *   useActionStateToast(state, { success: "Profile saved" });
 */
export function useActionStateToast(
  state: ActionStateLike | undefined,
  options: { success?: string; error?: string } = {},
): void {
  const initial = useRef(state);
  const latestOptions = useRef(options);
  useEffect(() => {
    latestOptions.current = options;
  });
  useEffect(() => {
    if (!state || state === initial.current) return;
    if (state.ok) {
      const title = state.message || latestOptions.current.success;
      if (title) toast.success(title);
    } else {
      const title = state.formError || latestOptions.current.error;
      if (title) toast.error(title);
    }
  }, [state]);
}

/**
 * Fires one toast when it mounts, e.g. after a Server Action redirected here:
 * `{saved ? <ToastOnMount tone="success" title="Profile saved" /> : null}`.
 */
export function ToastOnMount({ title, description, tone = "success" }: { title: string; description?: string; tone?: ToastTone }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    push(tone, title, { description });
  }, [title, description, tone]);
  return null;
}

const toneStyles: Record<ToastTone, { icon: ReactNode; ring: string; bar: string; iconColor: string }> = {
  success: {
    icon: <CircleCheck aria-hidden="true" />,
    ring: "shadow-glow-success",
    bar: "bg-success-600",
    iconColor: "text-success-600",
  },
  error: {
    icon: <CircleX aria-hidden="true" />,
    ring: "shadow-glow-danger",
    bar: "bg-danger-600",
    iconColor: "text-danger-600",
  },
  warning: {
    icon: <TriangleAlert aria-hidden="true" />,
    ring: "shadow-glow-sm",
    bar: "bg-warning-600",
    iconColor: "text-warning-600",
  },
  info: {
    icon: <Info aria-hidden="true" />,
    ring: "shadow-glow-sm",
    bar: "bg-neon-cyan",
    iconColor: "text-neon-cyan",
  },
};

function ToastItem({ record }: { record: ToastRecord }) {
  const duration = record.duration ?? (record.tone === "error" ? 8000 : 5000);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => dismiss(record.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(800, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, record.id]);

  const style = toneStyles[record.tone];
  return (
    <m.li
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "glass-strong pointer-events-auto relative w-full overflow-hidden rounded-2xl sm:w-96",
        style.ring,
      )}
    >
      <div className="flex items-start gap-3 p-4 pr-12 sm:pr-11">
        <span className={cn("mt-0.5 shrink-0 [&_svg]:size-5", style.iconColor)}>{style.icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{record.title}</p>
          {record.description ? <p className="mt-1 text-sm text-fg-muted">{record.description}</p> : null}
          {record.action ? (
            <Link
              href={record.action.href}
              onClick={() => dismiss(record.id)}
              className="mt-2 inline-flex text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
            >
              {record.action.label}
            </Link>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismiss(record.id)}
        className="absolute top-1 right-1 grid size-11 place-items-center rounded-xl text-fg-subtle transition-colors hover:bg-fg/8 hover:text-fg sm:top-2.5 sm:right-2.5 sm:size-8 sm:rounded-lg"
        aria-label={`Dismiss: ${record.title}`}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
      <span
        aria-hidden="true"
        className={cn("absolute inset-x-0 bottom-0 h-0.5 origin-left opacity-70", style.bar)}
        style={{
          animation: `wm-toast-progress ${duration}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
    </m.li>
  );
}

/** Renders the toast stack and its live regions. Mounted once, in the root layout. */
export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => records, () => EMPTY);
  const latestPolite = [...items].reverse().find((item) => item.tone !== "error");
  const latestAlert = [...items].reverse().find((item) => item.tone === "error");
  const announce = (item: ToastRecord | undefined) =>
    item ? [item.title, item.description].filter(Boolean).join(". ") : "";

  return (
    <>
      <section
        aria-label="Status messages"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:left-auto sm:p-4"
      >
        <ol className="flex flex-col items-stretch gap-2 sm:items-end">
          <AnimatePresence initial={false}>
            {items.map((record) => (
              <ToastItem key={record.id} record={record} />
            ))}
          </AnimatePresence>
        </ol>
      </section>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announce(latestPolite)}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {announce(latestAlert)}
      </div>
    </>
  );
}
