import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Errors as returned by Zod's flattened field errors or a single message. */
export type FieldErrorValue = string | readonly string[] | null | undefined;

export function firstError(error: FieldErrorValue): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error || undefined;
  return error.find((message) => message.length > 0);
}

export function FieldHint({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} className={cn("text-sm text-fg-muted", className)}>
      {children}
    </p>
  );
}

export function FieldError({ id, message, className }: { id?: string; message: string; className?: string }) {
  return (
    <p id={id} className={cn("flex animate-fade-in items-start gap-1.5 text-sm font-medium text-danger-700", className)}>
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="sr-only">Error: </span>
        {message}
      </span>
    </p>
  );
}
