/**
 * Stable DOM id for the control with this `name`. Field, Checkbox and RadioGroup use it by
 * default, and FormErrorSummary links each field error to `#${fieldId(name)}`.
 */
export function fieldId(name: string): string {
  return `field-${name.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

/** Joins aria-describedby ids, skipping empty ones. Returns undefined when none remain. */
export function joinIds(...ids: Array<string | null | undefined | false>): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}
