import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { fieldId, joinIds } from "./field-id";
import { FieldError, FieldHint, firstError, type FieldErrorValue } from "./field-message";

export type RadioOption = {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
};

export type RadioGroupProps = {
  name: string;
  legend: ReactNode;
  options: readonly RadioOption[];
  defaultValue?: string;
  /** Controlled value; only from Client Components, together with onValueChange. */
  value?: string;
  onValueChange?: (value: string) => void;
  hint?: ReactNode;
  error?: FieldErrorValue;
  /** Marks the legend with * and requires a choice (native validation). */
  required?: boolean;
  /** "cards" renders each option as a bordered, fully clickable tile. */
  variant?: "list" | "cards";
  columns?: 1 | 2 | 3;
  hideLegend?: boolean;
  /** Fieldset id; defaults to `fieldId(name)` so error summaries can link to it. */
  id?: string;
  className?: string;
};

const columnClasses = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
} as const;

/** Native radio buttons in a fieldset with legend, hint and error. */
export function RadioGroup({
  name,
  legend,
  options,
  defaultValue,
  value,
  onValueChange,
  hint,
  error,
  required = false,
  variant = "list",
  columns = 1,
  hideLegend = false,
  id,
  className,
}: RadioGroupProps) {
  const groupId = id ?? fieldId(name);
  const message = firstError(error);
  const hintId = hint ? `${groupId}-hint` : undefined;
  const errorId = message ? `${groupId}-error` : undefined;
  const controlled = value !== undefined;

  return (
    <fieldset
      id={groupId}
      role="radiogroup"
      aria-describedby={joinIds(hintId, errorId)}
      aria-invalid={message ? true : undefined}
      className={cn("space-y-2", className)}
    >
      <legend className={cn("text-sm font-medium text-fg", hideLegend && "sr-only")}>
        {legend}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger-600">
            *
          </span>
        ) : null}
      </legend>
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      <div className={cn("grid gap-3 pt-1", columnClasses[columns])}>
        {options.map((option) => {
          const optionId = `${groupId}-${option.value.replace(/[^A-Za-z0-9_-]/g, "-")}`;
          const optionHintId = option.hint ? `${optionId}-hint` : undefined;
          const input = (
            <input
              type="radio"
              id={optionId}
              name={name}
              value={option.value}
              required={required}
              disabled={option.disabled}
              aria-describedby={optionHintId}
              className="mt-0.5 size-4.5 shrink-0 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
              {...(controlled
                ? { checked: value === option.value }
                : { defaultChecked: defaultValue === option.value })}
              {...(onValueChange || controlled
                ? { onChange: () => onValueChange?.(option.value) }
                : {})}
            />
          );

          if (variant === "cards") {
            return (
              <div
                key={option.value}
                className="glass-lite relative flex items-start gap-3 rounded-xl p-4 transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong has-[:checked]:border-neon-cyan/70 has-[:checked]:bg-neon-cyan/[0.07] has-[:checked]:shadow-glow-sm has-[:disabled]:opacity-60 has-[:disabled]:hover:translate-y-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-neon-cyan"
              >
                {input}
                <div className="min-w-0 space-y-0.5 text-sm">
                  {/* the label's overlay makes the whole tile clickable */}
                  <label
                    htmlFor={optionId}
                    className="block cursor-pointer font-medium text-fg after:absolute after:inset-0 after:rounded-xl"
                  >
                    {option.label}
                  </label>
                  {option.hint ? <FieldHint id={optionHintId}>{option.hint}</FieldHint> : null}
                </div>
              </div>
            );
          }

          return (
            <div key={option.value} className="flex items-start gap-3">
              {input}
              <div className="min-w-0 space-y-0.5 text-sm">
                <label htmlFor={optionId} className="-my-2 block cursor-pointer py-2 text-fg sm:my-0 sm:inline sm:py-0">
                  {option.label}
                </label>
                {option.hint ? <FieldHint id={optionHintId}>{option.hint}</FieldHint> : null}
              </div>
            </div>
          );
        })}
      </div>
      {message ? <FieldError id={errorId} message={message} /> : null}
    </fieldset>
  );
}
