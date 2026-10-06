"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { fieldId } from "@/components/ui/field-id";
import { cn } from "@/lib/cn";

import type { UploadBudget } from "./media-types";
import { FILES_REPLACED_EVENT, formFilesBytes, formIsShrinking, overBudgetMessage } from "./upload-budget";

export type UploadBudgetGuardProps = {
  /** The hosted site's upload rules; without them (local runs) the guard renders nothing. */
  budget?: UploadBudget;
  /** What to do when the files don't fit, e.g. "Remove a photo or choose a shorter video." */
  advice: string;
  /**
   * The file field to send people back to (its `name`): the message links to it, and a
   * stopped submit follows that link (in the request wizard, it opens the field's step).
   */
  reviewField?: { name: string; label: string };
  className?: string;
};

/** `element` when it is a submit button of `form` (what requestSubmit accepts), else undefined. */
function submitButtonOf(form: HTMLFormElement, element: HTMLElement | null): HTMLButtonElement | HTMLInputElement | undefined {
  if (!(element instanceof HTMLButtonElement || element instanceof HTMLInputElement)) return undefined;
  return element.type === "submit" && element.form === form ? element : undefined;
}

/**
 * Keeps a form with file inputs from sending more than the hosted site accepts in one
 * request: placed inside the form, it adds up the chosen files as they change, shows a
 * message while they are over the budget and stops the submit (before the form's action
 * runs) instead of letting the platform refuse the request. A submit made while pictures are
 * still being shrunk waits for them and then goes ahead by itself. The server checks again.
 */
export function UploadBudgetGuard({ budget, advice, reviewField, className }: UploadBudgetGuardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [total, setTotal] = useState(0);
  // True while pictures in the form are being shrunk: their final sizes aren't known yet.
  const [shrinking, setShrinking] = useState(false);
  // Increases with every stopped submit, so each one brings the message into view.
  const [stopped, setStopped] = useState(0);
  // True while a submit waits for the pictures being shrunk.
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!budget || !form) return;
    // The submit held while pictures were being shrunk (with the button it was made with).
    let held: { submitter: HTMLElement | null } | null = null;
    const recount = () => {
      const busy = formIsShrinking(form);
      setTotal(formFilesBytes(form));
      setShrinking(busy);
      if (!held || busy) return;
      const { submitter } = held;
      held = null;
      setWaiting(false);
      form.requestSubmit(submitButtonOf(form, submitter));
    };
    const onSubmit = (event: SubmitEvent) => {
      if (formIsShrinking(form)) {
        // React runs a form action only when the submit event was not cancelled.
        event.preventDefault();
        held = { submitter: event.submitter };
        setWaiting(true);
        return;
      }
      const bytes = formFilesBytes(form);
      setTotal(bytes);
      if (bytes <= budget.maxRequestBytes) return;
      event.preventDefault();
      setStopped((count) => count + 1);
    };
    recount();
    form.addEventListener("change", recount);
    form.addEventListener(FILES_REPLACED_EVENT, recount);
    form.addEventListener("reset", recount);
    form.addEventListener("submit", onSubmit);
    return () => {
      form.removeEventListener("change", recount);
      form.removeEventListener(FILES_REPLACED_EVENT, recount);
      form.removeEventListener("reset", recount);
      form.removeEventListener("submit", onSubmit);
    };
  }, [budget]);

  useEffect(() => {
    if (stopped === 0) return;
    if (linkRef.current) linkRef.current.click();
    else rootRef.current?.scrollIntoView({ block: "center" });
  }, [stopped]);

  const message = budget && !shrinking ? overBudgetMessage(total, budget, advice) : null;
  return (
    <div ref={rootRef} aria-live="polite" className={cn("empty:hidden", className)}>
      {waiting ? (
        <p role="status" className="text-sm text-fg-muted">
          Resizing photos before sending…
        </p>
      ) : null}
      {message ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            {message}
            {reviewField ? (
              <>
                {" "}
                <a ref={linkRef} href={`#${fieldId(reviewField.name)}`} className="font-semibold underline underline-offset-4">
                  {reviewField.label}
                </a>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
