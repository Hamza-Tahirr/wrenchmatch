import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlClasses, controlWrapperClasses } from "./control-styles";

export type InputProps = ComponentProps<"input"> & {
  /** Short text shown inside the box before the value, e.g. "$". Put the unit in the label too. */
  leadingText?: string;
  /** Short text shown after the value, e.g. "miles". */
  trailingText?: string;
};

/** Native text-like input. Wrap in <Field> for its label, hint and error. */
export function Input({ leadingText, trailingText, className, type = "text", ...props }: InputProps) {
  if (!leadingText && !trailingText) {
    return <input type={type} className={cn(controlClasses, "px-3.5 py-2.5", className)} {...props} />;
  }
  return (
    <div className={cn(controlWrapperClasses, className)}>
      {leadingText ? (
        <span aria-hidden="true" className="flex select-none items-center pl-3.5 font-mono text-base text-fg-subtle sm:text-sm">
          {leadingText}
        </span>
      ) : null}
      <input
        type={type}
        className="block w-full min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2.5 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-none disabled:cursor-not-allowed sm:text-sm"
        {...props}
      />
      {trailingText ? (
        <span aria-hidden="true" className="flex select-none items-center pr-3.5 text-base text-fg-subtle sm:text-sm">
          {trailingText}
        </span>
      ) : null}
    </div>
  );
}
