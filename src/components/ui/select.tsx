import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlClasses } from "./control-styles";

export type SelectProps = ComponentProps<"select"> & {
  /** Adds a first, empty option (value ""), e.g. "Choose a make". With `required` it must be changed. */
  placeholder?: string;
};

/** Native <select> with a consistent look. Wrap in <Field> for its label, hint and error. */
export function Select({ placeholder, className, children, ...props }: SelectProps) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(controlClasses, "cursor-pointer appearance-none py-2.5 pr-10 pl-3.5")} {...props}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle"
      />
    </div>
  );
}
