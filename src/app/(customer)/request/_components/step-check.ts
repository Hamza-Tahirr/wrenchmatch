// Client-side completeness checks for one step of the request wizard. They only look for
// empty required controls so "Next" can point at what is missing; the server validates
// every rule again when the request is sent.

export type MissingControl = { name: string; element: HTMLElement };

const CONTROLS = "input, select, textarea";

/**
 * Required controls in `section` that have no value yet, in document order. Radio groups
 * count once (none checked); `allRequiredCheckboxes` are groups where every box must be
 * ticked (the consents). File inputs are always optional.
 */
export function missingRequired(section: HTMLElement, allRequiredCheckboxes: readonly string[]): MissingControl[] {
  const missing: MissingControl[] = [];
  const seenRadios = new Set<string>();
  for (const control of section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(CONTROLS)) {
    if (control.disabled || !control.name) continue;
    if (control instanceof HTMLInputElement && control.type === "radio") {
      if (!control.required || seenRadios.has(control.name)) continue;
      seenRadios.add(control.name);
      const checked = section.querySelector(`input[type="radio"][name="${CSS.escape(control.name)}"]:checked`);
      if (!checked) missing.push({ name: control.name, element: control });
      continue;
    }
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      if (!allRequiredCheckboxes.includes(control.name)) continue;
      if (!control.checked && !missing.some((item) => item.name === control.name)) {
        missing.push({ name: control.name, element: control });
      }
      continue;
    }
    if (control instanceof HTMLInputElement && (control.type === "file" || control.type === "hidden")) continue;
    if (control.required && control.value.trim() === "") missing.push({ name: control.name, element: control });
  }
  return missing;
}

/** The section (wizard step) that holds the control with this DOM id, if any. */
export function stepOfElement(root: HTMLElement, elementId: string, stepIds: readonly string[]): number {
  const target = root.ownerDocument.getElementById(elementId);
  if (!target) return -1;
  return stepIds.findIndex((stepId) => root.ownerDocument.getElementById(stepId)?.contains(target) ?? false);
}

/** The first focusable control inside `element` (or the element itself). */
export function focusableIn(element: HTMLElement): HTMLElement {
  if (element.matches("input, select, textarea, button")) return element;
  return (
    element.querySelector<HTMLElement>("input:checked") ??
    element.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button") ??
    element
  );
}
