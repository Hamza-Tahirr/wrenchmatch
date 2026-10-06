"use client";

import { X } from "lucide-react";
import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./button";

type DialogContextValue = { close: () => void };

const DialogContext = createContext<DialogContextValue | null>(null);

// Widths from `sm` up; below that the dialog is a full-width bottom sheet.
const sizes = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
} as const;

export type DialogProps = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Actions row at the bottom (e.g. <DialogClose /> and a submit button). */
  footer?: ReactNode;
  /** Label of the button that opens the dialog. Omit it when controlling `open` yourself. */
  trigger?: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  /** Icon element shown in the trigger button. */
  triggerIcon?: ReactNode;
  triggerClassName?: string;
  /** Controlled mode (from Client Components only). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: keyof typeof sizes;
};

/**
 * Modal dialog built on the native <dialog>: focus is trapped while open, Escape and the
 * close button dismiss it, focus returns to the element that opened it, and it is
 * labelled by its title (and described by its description). Content renders only while open.
 * On phones (below 640px) it slides up as a bottom sheet that clears the home indicator.
 */
export function Dialog({
  title,
  description,
  children,
  footer,
  trigger,
  triggerVariant = "secondary",
  triggerSize = "md",
  triggerIcon,
  triggerClassName,
  open,
  onOpenChange,
  size = "md",
}: DialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  function setOpen(next: boolean) {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  // Layout effect so the native dialog opens/closes in the same frame its content renders.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement ? active : triggerRef.current;
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Runs for every way the dialog closes: Escape, close button, light dismiss, dialog.close().
  function handleClose() {
    setOpen(false);
    const target = returnFocusRef.current ?? triggerRef.current;
    if (target?.isConnected) target.focus();
  }

  return (
    <DialogContext value={{ close: () => setOpen(false) }}>
      {trigger !== undefined ? (
        <Button
          ref={triggerRef}
          variant={triggerVariant}
          size={triggerSize}
          leadingIcon={triggerIcon}
          className={triggerClassName}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {trigger}
        </Button>
      ) : null}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        closedby="any"
        onClose={handleClose}
        className={cn(
          "glass-strong mx-0 mt-auto mb-0 max-h-[calc(100dvh-1.5rem)] w-full max-w-full overflow-y-auto overscroll-contain rounded-t-3xl rounded-b-none pb-[env(safe-area-inset-bottom)] text-fg backdrop:animate-fade-in open:animate-[wm-sheet-up_0.42s_var(--ease-out-expo)_both]",
          "sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:rounded-2xl sm:pb-0 sm:open:animate-scale-in",
          sizes[size],
        )}
      >
        {isOpen ? (
          <>
            <div className="relative flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 -top-px h-px bg-linear-to-r from-transparent via-neon-cyan to-transparent opacity-80" />
              <div className="min-w-0 space-y-1">
                <h2 id={titleId} className="font-display text-lg font-semibold tracking-tight text-fg">
                  {title}
                </h2>
                {description ? (
                  <div id={descriptionId} className="text-sm text-fg-muted">
                    {description}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mt-2 -mr-3 grid size-11 shrink-0 place-items-center rounded-xl text-fg-subtle transition-[color,background-color,transform] hover:rotate-90 hover:bg-fg/[0.08] hover:text-fg sm:-mt-1 sm:-mr-2 sm:size-9"
              >
                <X aria-hidden="true" className="size-5" />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <div className="px-5 py-4">{children}</div>
            {footer ? (
              <div className="flex flex-col-reverse gap-2 border-t border-line bg-fg/[0.03] px-5 py-3 sm:flex-row sm:justify-end">
                {footer}
              </div>
            ) : null}
          </>
        ) : null}
      </dialog>
    </DialogContext>
  );
}

/** Closes the surrounding Dialog. Defaults to a secondary "Cancel" button. */
export function DialogClose({ children = "Cancel", variant = "secondary", onClick, ...props }: ButtonProps) {
  const dialog = useContext(DialogContext);
  return (
    <Button
      variant={variant}
      onClick={(event) => {
        onClick?.(event);
        dialog?.close();
      }}
      {...props}
    >
      {children}
    </Button>
  );
}

/** Access to the surrounding Dialog (e.g. to close it after a successful action). */
export function useDialog(): DialogContextValue | null {
  return useContext(DialogContext);
}
