"use client";

import { toast } from "@/components/ui/toast";

// Admin confirmations go through the app-wide Toaster (src/components/ui/toast.tsx, rendered
// by the root layout), so a message survives the refresh that follows an action even when the
// control that triggered it is gone (e.g. an "Approve" button after approving). Errors stay
// inline next to the form as the source of truth; the error toast only echoes them.

type AdminToast = (message: string, options?: { tone?: "success" | "error" | "info" | "warning"; description?: string }) => void;

const show: AdminToast = (message, options = {}) => {
  const { tone = "success", description } = options;
  toast[tone](message, description ? { description } : undefined);
};

/** Shows a confirmation toast for an admin action. */
export function useAdminToast(): AdminToast {
  return show;
}

