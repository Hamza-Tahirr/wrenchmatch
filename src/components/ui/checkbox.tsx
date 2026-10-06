import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { fieldId, joinIds } from "./field-id";
import { FieldError, FieldHint, firstError, type FieldErrorValue } from "./field-message";

const boxClasses =
  "mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-brand-600 transition-shadow focus-visible:shadow-glow-sm disabled:cursor-not-allowed";

export type CheckboxProps = Omit<ComponentProps<"input">, "type" | "children"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: FieldErrorValue;
};

/**
 * A single checkbox with its own label, hint and error (e.g. a consent). Its id defaults
 * to `fieldId(name)`; pass explicit ids when several checkboxes share a name, or use
 * CheckboxGroup.
 */
export function Checkbox({
  label,
  hint,
  error,
  id,
  name,
  className,
  "aria-describedby": describedBy,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? (name ? fieldId(name) : generatedId);
  const message = firstError(error);
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = message ? `${inputId}-error` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={inputId}
          name={name}
          aria-describedby={joinIds(describedBy, hintId, errorId)}
          aria-invalid={message ? true : undefined}
          className={boxClasses}
          {...props}
        />
        <div className="min-w-0 space-y-0.5 text-sm">
          <label htmlFor={inputId} className="-my-3 block cursor-pointer py-3 font-medium text-fg sm:my-0 sm:inline sm:py-0">
            {label}
          </label>
          {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
        </div>
      </div>
      {message ? <FieldError id={errorId} message={message} /> : null}
    </div>
  );
}

export type CheckboxOption = {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
};

export type CheckboxGroupProps = {
  /** Shared name; the server reads every checked value with formData.getAll(name). */
  name: string;
  legend: ReactNode;
  options: readonly CheckboxOption[];
  defaultValues?: readonly string[];
  hint?: ReactNode;
  error?: FieldErrorValue;
  /** Shows the required marker. "At least one" is validated on the server. */
  required?: boolean;
  columns?: 1 | 2 | 3;
  id?: string;
  className?: string;
};

const columnClasses = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
} as const;

/** A fieldset of checkboxes sharing one name (e.g. makes serviced). */
export function CheckboxGroup({
  name,
  legend,
  options,
  defaultValues = [],
  hint,
  error,
  required = false,
  columns = 1,
  id,
  className,
}: CheckboxGroupProps) {
  const groupId = id ?? fieldId(name);
  const message = firstError(error);
  const hintId = hint ? `${groupId}-hint` : undefined;
  const errorId = message ? `${groupId}-error` : undefined;
  return (
    <fieldset id={groupId} aria-describedby={joinIds(hintId, errorId)} className={cn("space-y-2", className)}>
      <legend className="text-sm font-medium text-fg">
        {legend}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger-600">
            *
          </span>
        ) : null}
      </legend>
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      <div className={cn("grid gap-x-6 gap-y-3 pt-1", columnClasses[columns])}>
        {options.map((option) => {
          const optionId = `${groupId}-${option.value.replace(/[^A-Za-z0-9_-]/g, "-")}`;
          const optionHintId = option.hint ? `${optionId}-hint` : undefined;
          return (
            <div key={option.value} className="flex items-start gap-3">
              <input
                type="checkbox"
                id={optionId}
                name={name}
                value={option.value}
                defaultChecked={defaultValues.includes(option.value)}
                disabled={option.disabled}
                aria-describedby={optionHintId}
                className={boxClasses}
              />
              <div className="min-w-0 space-y-0.5 text-sm">
                <label htmlFor={optionId} className="-my-3 block cursor-pointer py-3 text-fg sm:my-0 sm:inline sm:py-0">
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
