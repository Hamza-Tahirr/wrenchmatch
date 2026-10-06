"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useId, useRef, type MouseEvent } from "react";
import { fieldId } from "./field-id";
import { firstError, type FieldErrorValue } from "./field-message";

export type FormErrorSummaryProps = {
  title?: string;
  /** An error about the whole form (e.g. "That ZIP code is outside the pilot area"). */
  formError?: string | null;
  /** Field errors keyed by field name, e.g. Zod's `flatten().fieldErrors`. */
  fieldErrors?: Partial<Record<string, FieldErrorValue>>;
  /** Optional label per field name, shown before its message. */
  labels?: Partial<Record<string, string>>;
  /** Field ids for names whose control does not use `fieldId(name)`. */
  fieldIds?: Partial<Record<string, string>>;
  /** Change this (e.g. pass the action state object) to move focus here after each submit. */
  focusKey?: unknown;
};

const FOCUSABLE = "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])";

function focusField(event: MouseEvent<HTMLAnchorElement>, targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) return;
  event.preventDefault();
  const control = target.matches(FOCUSABLE)
    ? target
    : (target.querySelector<HTMLElement>("input:checked") ?? target.querySelector<HTMLElement>(FOCUSABLE));
  target.scrollIntoView({ block: "center" });
  (control ?? target).focus({ preventScroll: true });
}

/**
 * Lists a failed submission's errors at the top of the form. It is announced (role=alert),
 * takes focus when it appears, and each item links to its field.
 */
export function FormErrorSummary({
  title = "There is a problem",
  formError,
  fieldErrors = {},
  labels = {},
  fieldIds = {},
  focusKey,
}: FormErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const items = Object.entries(fieldErrors).flatMap(([name, error]) => {
    const message = firstError(error);
    return message ? [{ name, message, targetId: fieldIds[name] ?? fieldId(name) }] : [];
  });
  const signature = `${formError ?? ""}|${items.map((item) => `${item.name}:${item.message}`).join("|")}`;
  const hasErrors = Boolean(formError) || items.length > 0;

  useEffect(() => {
    if (hasErrors) ref.current?.focus();
  }, [hasErrors, signature, focusKey]);

  if (!hasErrors) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      aria-labelledby={titleId}
      className="relative animate-fade-in overflow-hidden rounded-xl border border-danger-500/35 bg-danger-500/[0.09] p-4 pl-5 shadow-glow-danger focus-visible:outline-danger-600"
    >
      <div className="flex gap-3">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger-600 drop-shadow-[0_0_8px_var(--color-danger-600)]" />
        <div className="min-w-0 space-y-2 text-sm">
          <h2 id={titleId} className="font-semibold text-danger-900">
            {title}
          </h2>
          {formError ? <p className="text-danger-900">{formError}</p> : null}
          {items.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-danger-800">
              {items.map((item) => (
                <li key={item.name}>
                  <a
                    href={`#${item.targetId}`}
                    onClick={(event) => focusField(event, item.targetId)}
                    className="font-medium underline underline-offset-2 hover:text-danger-900"
                  >
                    {labels[item.name] ? `${labels[item.name]}: ` : null}
                    {item.message}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
