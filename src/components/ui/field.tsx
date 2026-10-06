import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { fieldId, joinIds } from "./field-id";
import { FieldError, FieldHint, firstError, type FieldErrorValue } from "./field-message";

/** Props Field adds to its control. */
export type FieldControlProps = {
  id: string;
  name?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type ControlElement = ReactElement<Partial<FieldControlProps>>;

export type FieldProps = {
  label: ReactNode;
  /** Control name. Optional when the child control already has a `name`. */
  name?: string;
  /** Control id. Defaults to `fieldId(name)` so error summaries can link to it. */
  id?: string;
  /** Help shown between the label and the control. */
  hint?: ReactNode;
  error?: FieldErrorValue;
  /** Marks the label with * and adds `required` to the control. */
  required?: boolean;
  /** Adds "(optional)" after the label. */
  optional?: boolean;
  /** Keeps the label for screen readers only. */
  hideLabel?: boolean;
  className?: string;
  /**
   * One control element (Input, Textarea, Select, FileInput...) that receives id, name,
   * required, aria-describedby and aria-invalid; or a render function for custom markup.
   */
  children: ControlElement | ((control: FieldControlProps) => ReactNode);
};

/** Label + hint + error wrapper that wires accessibility attributes onto its control. */
export function Field({
  label,
  name,
  id,
  hint,
  error,
  required = false,
  optional = false,
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const childProps = isValidElement(children) ? children.props : undefined;
  const controlName = name ?? childProps?.name;
  const controlId = id ?? childProps?.id ?? (controlName ? fieldId(controlName) : generatedId);
  const message = firstError(error);
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = message ? `${controlId}-error` : undefined;

  const control: FieldControlProps = {
    id: controlId,
    ...(name ? { name } : {}),
    ...(required ? { required: true } : {}),
    "aria-describedby": joinIds(childProps?.["aria-describedby"], hintId, errorId),
    ...(message ? { "aria-invalid": true as const } : {}),
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={controlId}
        className={cn("block text-sm font-medium text-fg", hideLabel && "sr-only")}
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger-600">
            *
          </span>
        ) : null}
        {optional && !required ? (
          <span className="ml-1.5 font-normal text-fg-subtle">(optional)</span>
        ) : null}
      </label>
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      {isValidElement(children) ? cloneElement(children, control) : children(control)}
      {message ? <FieldError id={errorId} message={message} /> : null}
    </div>
  );
}
