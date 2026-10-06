import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlClasses } from "./control-styles";

export type TextareaProps = ComponentProps<"textarea">;

/** Native multi-line input. Wrap in <Field> for its label, hint and error. */
export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return <textarea rows={rows} className={cn(controlClasses, "min-h-24 px-3.5 py-2.5", className)} {...props} />;
}
