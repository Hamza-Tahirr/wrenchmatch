"use client";

import { ArrowLeft, ArrowRight, Check, CircleAlert } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { focusableIn, missingRequired } from "./step-check";

// The request form as a five-step wizard. Every step stays in the DOM (hidden steps keep
// their values and files, and the browser submits them with the form); only the current
// one is shown. "Next" checks the step's required fields (the form shows each missing one's
// message right at the field, and a summary sits next to the button), Enter moves on instead
// of sending, and after a refused submit the wizard opens the first step with an error. The
// Back / Next / Send bar sticks to the bottom of the screen while the step is longer than it.

export type WizardStepDef = {
  /** DOM id of the step's <section> (also its #anchor). */
  id: string;
  label: string;
  icon: ReactNode;
  /** Form field names in this step, to open the right step for an error. */
  fields: readonly string[];
};

type WizardState = { currentId: string; index: number; total: number; direction: "forward" | "back" };

const WizardContext = createContext<WizardState | null>(null);

/** Whether a step is the one shown, and how it should animate in. Outside a wizard every step shows. */
export function useWizardStep(id: string): { active: boolean; index: number; total: number; direction: "forward" | "back" } {
  const state = useContext(WizardContext);
  if (!state) return { active: true, index: 0, total: 1, direction: "forward" };
  return { active: state.currentId === id, index: state.index, total: state.total, direction: state.direction };
}

function firstErrorStep(steps: readonly WizardStepDef[], errorNames: readonly string[]): number {
  const indexes = errorNames
    .map((name) => steps.findIndex((step) => step.fields.includes(name)))
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Focuses a field and brings it to the middle of the screen, clear of the header and the sticky bar. */
function focusField(element: HTMLElement): void {
  const control = focusableIn(element);
  control.focus({ preventScroll: true });
  control.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

export type RequestWizardProps = {
  steps: readonly WizardStepDef[];
  /** Field names with a server error (after a refused submit); the wizard opens their step. */
  errorNames: readonly string[];
  /** True after a refused submit, so a form-level error lands on the last step. */
  refused: boolean;
  /** Checkbox groups where every box must be ticked (the consents). */
  allRequiredCheckboxes: readonly string[];
  /** Labels of the fields, for "Fill in Year and Make to continue". */
  labels: Readonly<Record<string, string>>;
  /** Names of the required fields "Next" found empty (the form shows their messages at the fields). */
  missing: readonly string[];
  onMissingChange: (names: readonly string[]) => void;
  /** Shown above the steps whatever step is open (the error summary). */
  header?: ReactNode;
  /** The send button area, shown on the last step instead of "Next". */
  finish: ReactNode;
  children: ReactNode;
};

function listLabels(labels: readonly string[]): string {
  const unique = [...new Set(labels)];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

export function RequestWizard({
  steps,
  errorNames,
  refused,
  allRequiredCheckboxes,
  labels,
  missing,
  onMissingChange,
  header,
  finish,
  children,
}: RequestWizardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // The fields remount (and this wizard with them) after every refused submit, so the
  // first step with an error is worked out once, when it mounts.
  const [index, setIndex] = useState(() => {
    const errorStep = firstErrorStep(steps, errorNames);
    if (errorStep >= 0) return errorStep;
    return refused ? steps.length - 1 : 0;
  });
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const focusAfterMove = useRef<HTMLElement | "heading" | null>(null);
  const last = steps.length - 1;
  const current = steps[index];

  // Fields focused with the keyboard stay clear of the sticky bar at the bottom of the screen.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollPaddingBottom;
    root.style.scrollPaddingBottom = "7rem";
    return () => {
      root.style.scrollPaddingBottom = previous;
    };
  }, []);

  // After a move: bring the wizard into view and focus the new step's heading (or a field).
  useEffect(() => {
    const target = focusAfterMove.current;
    if (!target) return;
    focusAfterMove.current = null;
    const root = rootRef.current;
    if (root && root.getBoundingClientRect().top < 0) {
      root.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
    if (target === "heading") document.getElementById(`${current.id}-title`)?.focus({ preventScroll: true });
    else focusField(target);
  }, [index, current.id]);

  const goTo = useCallback(
    (next: number, focus: HTMLElement | "heading" = "heading") => {
      setDirection(next >= index ? "forward" : "back");
      onMissingChange([]);
      focusAfterMove.current = focus;
      setIndex(next);
    },
    [index, onMissingChange],
  );

  /** Names of the required fields of step `stepIndex` that are still empty. */
  const checkStep = useCallback(
    (stepIndex: number): string[] => {
      const section = document.getElementById(steps[stepIndex].id);
      const gaps = section ? missingRequired(section, allRequiredCheckboxes) : [];
      return [...new Set(gaps.map((gap) => gap.name))];
    },
    [steps, allRequiredCheckboxes],
  );

  const next = useCallback(() => {
    const section = document.getElementById(current.id);
    const gaps = section ? missingRequired(section, allRequiredCheckboxes) : [];
    if (gaps.length > 0) {
      onMissingChange([...new Set(gaps.map((gap) => gap.name))]);
      // Brings the field into view, where its message now shows.
      focusField(gaps[0].element);
      return;
    }
    if (index < last) goTo(index + 1);
  }, [current.id, allRequiredCheckboxes, index, last, goTo, onMissingChange]);

  /** The stepper: earlier steps are always open; later ones only past complete steps. */
  const jump = useCallback(
    (target: number) => {
      if (target <= index) {
        if (target !== index) goTo(target);
        return;
      }
      for (let step = index; step < target; step += 1) {
        const gaps = checkStep(step);
        if (gaps.length > 0) {
          if (step !== index) goTo(step);
          onMissingChange(gaps);
          return;
        }
      }
      goTo(target);
    },
    [index, goTo, checkStep, onMissingChange],
  );

  // A field's "missing" message goes away as soon as it is filled in (a consent group only
  // once every box is ticked).
  const onChange = useCallback(
    (event: ChangeEvent<HTMLDivElement>) => {
      const name = (event.target as Partial<HTMLInputElement>).name;
      if (!name || !missing.includes(name)) return;
      const section = document.getElementById(current.id);
      const gaps = section ? missingRequired(section, allRequiredCheckboxes) : [];
      const stillMissing = new Set(gaps.map((gap) => gap.name));
      const remaining = missing.filter((field) => stillMissing.has(field));
      if (remaining.length !== missing.length) onMissingChange(remaining);
    },
    [missing, current.id, allRequiredCheckboxes, onMissingChange],
  );

  // Error-summary links point at fields that may sit in a hidden step: open it first.
  const onClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#field-"]');
      if (!link) return;
      const targetId = link.getAttribute("href")?.slice(1) ?? "";
      const stepIndex = steps.findIndex((step) => document.getElementById(step.id)?.querySelector(`#${CSS.escape(targetId)}`));
      if (stepIndex < 0 || stepIndex === index) return;
      event.preventDefault();
      event.stopPropagation();
      const target = document.getElementById(targetId);
      goTo(stepIndex, target ? focusableIn(target) : "heading");
    },
    [steps, index, goTo],
  );

  // Enter in a text field moves to the next step instead of sending the whole request.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" || event.defaultPrevented || index === last) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || ["button", "submit", "file", "reset"].includes(target.type)) return;
      event.preventDefault();
      next();
    },
    [index, last, next],
  );

  const state = useMemo<WizardState>(
    () => ({ currentId: current.id, index, total: steps.length, direction }),
    [current.id, index, steps.length, direction],
  );

  return (
    <WizardContext.Provider value={state}>
      <div
        ref={rootRef}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
        onChange={onChange}
        className="scroll-mt-24 space-y-6"
      >
        <Stepper steps={steps} index={index} onJump={jump} />
        {header}
        {children}
        {/* Sticks to the bottom of the screen while the step is taller than it, and rests at
            the end of the form card (with its rounded corners) once the end is in view. */}
        <div className="sticky bottom-0 z-20 -mx-4 -mb-4 rounded-b-3xl border-t border-line bg-elevated/90 px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:-mx-8 sm:-mb-8 sm:px-8 sm:pt-4 sm:pb-6">
          {missing.length > 0 ? (
            <p role="alert" className="mb-3 flex items-start gap-2 text-sm font-medium text-warning-800">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Fill in {listLabels(missing.map((name) => labels[name] ?? name))} to continue.
            </p>
          ) : null}
          <div className="flex items-center gap-3 sm:justify-between">
            {index > 0 ? (
              <Button variant="ghost" size="lg" leadingIcon={<ArrowLeft />} onClick={() => goTo(index - 1)}>
                Back<span className="sr-only">: {steps[index - 1].label}</span>
              </Button>
            ) : (
              <span aria-hidden="true" className="hidden sm:block" />
            )}
            <div className="min-w-0 flex-1 sm:flex-none">
              {index < last ? (
                <Button size="lg" fullWidth trailingIcon={<ArrowRight />} onClick={next} className="sm:w-auto sm:min-w-44">
                  Next<span className="sr-only">: {steps[index + 1].label}</span>
                </Button>
              ) : (
                finish
              )}
            </div>
          </div>
        </div>
      </div>
    </WizardContext.Provider>
  );
}

/** Numbered step markers joined by a neon line that fills as the request takes shape. */
function Stepper({
  steps,
  index,
  onJump,
}: {
  steps: readonly WizardStepDef[];
  index: number;
  onJump: (index: number) => void;
}) {
  const progress = steps.length > 1 ? index / (steps.length - 1) : 1;
  return (
    <nav aria-label="Request steps" className="relative">
      <div aria-hidden="true" className="absolute top-[1.375rem] right-5 left-5 h-px bg-line-strong sm:top-[1.125rem]">
        <div
          className="h-full origin-left bg-linear-to-r from-neon-cyan via-neon-blue to-neon-violet shadow-[0_0_12px_var(--color-neon-cyan)] transition-transform duration-500 ease-(--ease-out-expo)"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <ol className="relative flex items-start justify-between">
        {steps.map((step, stepIndex) => {
          const state = stepIndex < index ? "done" : stepIndex === index ? "current" : "upcoming";
          return (
            <li key={step.id} className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => onJump(stepIndex)}
                aria-current={state === "current" ? "step" : undefined}
                className="group flex min-w-11 flex-col items-center gap-2 rounded-xl px-1 text-center"
              >
                <span
                  className={cn(
                    "relative grid size-11 place-items-center rounded-full border text-sm font-semibold transition-all duration-300 sm:size-9 [&_svg]:size-4",
                    state === "done" && "border-transparent bg-brand-600 text-on-brand shadow-glow-sm",
                    state === "current" && "border-neon-cyan/80 bg-brand-50 text-brand-900 shadow-glow",
                    state === "upcoming" &&
                      "border-line-strong bg-surface-2 text-fg-subtle group-hover:border-brand-400 group-hover:text-fg-muted",
                  )}
                >
                  {state === "done" ? <Check strokeWidth={3} aria-hidden="true" /> : <span aria-hidden="true">{step.icon}</span>}
                  {state === "current" ? (
                    <span aria-hidden="true" className="absolute inset-0 animate-pulse-ring rounded-full border border-neon-cyan" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-medium sm:block",
                    state === "current" ? "text-fg" : state === "done" ? "text-fg-muted" : "text-fg-subtle",
                  )}
                >
                  {step.label}
                </span>
                <span className="sr-only">
                  {`Step ${stepIndex + 1}: ${step.label}`}
                  {state === "done" ? " (done)" : state === "current" ? " (current)" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
