"use client";

import { ConfirmDialog, type ConfirmDialogProps } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/validation/mechanic";

import { InlineActionForm, type InlineActionFormProps } from "./inline-action-form";

// Client wrappers that confirm a finished Server Action with a toast. The page itself still
// shows the new state (the action revalidates it) and refusals stay inline in the dialog.

/** The success toast; without a title, the action's own message is the title. */
export type ToastSpec = { title?: string; description?: string; action?: { label: string; href: string } };

type ToastConfirmDialogProps = Omit<ConfirmDialogProps, "action" | "successToast"> & {
  action: (formData: FormData) => Promise<ActionResult>;
  /** Shown when the action succeeds; defaults to the action's own message. */
  successToast?: ToastSpec;
};

/**
 * ConfirmDialog with a richer success toast (title, description, link). The plain
 * ConfirmDialog would also toast the action's message, so that message is not passed on.
 */
export function ToastConfirmDialog({ action, successToast, ...props }: ToastConfirmDialogProps) {
  return (
    <ConfirmDialog
      {...props}
      action={async (formData) => {
        const result = await action(formData);
        if (!result.ok) return result;
        const title = successToast?.title ?? result.message ?? "Done";
        toast.success(title, { description: successToast?.description, action: successToast?.action });
        return { ok: true };
      }}
    />
  );
}

type ToastInlineActionProps = InlineActionFormProps & { successToast?: ToastSpec };

/** A one-click action button that confirms success with a toast. */
export function ToastInlineAction({ action, successToast, ...props }: ToastInlineActionProps) {
  return (
    <InlineActionForm
      {...props}
      action={async (formData) => {
        const result = await action(formData);
        if (result.ok) {
          const title = successToast?.title ?? result.message ?? "Done";
          toast.success(title, { description: successToast?.description, action: successToast?.action });
        }
        return result;
      }}
    />
  );
}
