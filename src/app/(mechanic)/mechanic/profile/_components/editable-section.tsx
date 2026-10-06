"use client";

import { CircleCheck, Pencil } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

import { TAP } from "../../_components/tap";

type EditableSectionContextValue = {
  /** Leaves edit mode; `message` confirms a save (toast and a "Saved" mark by the title). */
  close: (message?: string) => void;
};

const EditableSectionContext = createContext<EditableSectionContextValue | null>(null);

/** The surrounding EditableSection (forms close it after a successful save). */
export function useEditableSection(): EditableSectionContextValue | null {
  return useContext(EditableSectionContext);
}

type EditableSectionProps = {
  /** Anchor id, e.g. "profile-details" (#profile-details). */
  id: string;
  title: string;
  description?: ReactNode;
  /** Icon element for the neon tile. */
  icon?: ReactNode;
  /** Read-only view shown when not editing. */
  summary: ReactNode;
  /** The edit form. */
  children: ReactNode;
  editLabel?: string;
  /** Icon of the edit button (a pencil by default). */
  editIcon?: ReactNode;
  /** Open in edit mode (e.g. from a "?edit=..." link). */
  defaultEditing?: boolean;
  /** Badges next to the title (e.g. "2 pending review"). */
  badges?: ReactNode;
};

/**
 * A glass profile section that shows a summary and switches to its edit form on demand.
 * Focus moves to the form's first field on Edit and back to the heading after saving or
 * cancel; a save is confirmed with a toast and a "Saved" mark next to the title.
 */
export function EditableSection({
  id,
  title,
  description,
  icon,
  summary,
  children,
  editLabel = "Edit",
  editIcon = <Pencil />,
  defaultEditing = false,
  badges,
}: EditableSectionProps) {
  const [editing, setEditing] = useState(defaultEditing);
  const [saved, setSaved] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<"form" | "heading" | null>(null);
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;

  useEffect(() => {
    if (focusTarget.current === "form") {
      bodyRef.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select, textarea")?.focus();
    } else if (focusTarget.current === "heading") {
      headingRef.current?.focus();
    }
    focusTarget.current = null;
  }, [editing]);

  function open() {
    focusTarget.current = "form";
    setSaved(false);
    setEditing(true);
  }

  function close(message?: string) {
    focusTarget.current = "heading";
    if (message) {
      toast.success(message);
      setSaved(true);
    }
    setEditing(false);
  }

  return (
    <EditableSectionContext value={{ close }}>
      <section
        id={id}
        aria-labelledby={titleId}
        className={cn(
          // overflow-clip (not hidden): the forms' action bars stick to the bottom of the screen.
          "glass-lite relative scroll-mt-28 overflow-clip rounded-2xl transition-[border-color,box-shadow] duration-300",
          editing ? "border-neon-cyan/45 shadow-glow-sm" : null,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent transition-opacity",
            editing ? "via-neon-cyan opacity-100" : "via-neon-cyan/50 opacity-70",
          )}
        />
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? (
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/30 [&_svg]:size-5"
              >
                {icon}
              </span>
            ) : null}
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id={titleId}
                  ref={headingRef}
                  tabIndex={-1}
                  className="font-display text-lg font-semibold tracking-tight text-fg focus:outline-none"
                >
                  {title}
                </h2>
                {badges}
                {saved && !editing ? (
                  <span className="inline-flex animate-scale-in items-center gap-1 rounded-full border border-success-600/40 bg-success-600/10 px-2 py-0.5 text-xs font-medium text-success-700">
                    <CircleCheck aria-hidden="true" className="size-3.5" />
                    Saved
                  </span>
                ) : null}
              </div>
              {description ? <div className="text-sm text-fg-muted">{description}</div> : null}
            </div>
          </div>
          <div className="shrink-0">
            {editing ? (
              <Button variant="ghost" size="sm" onClick={() => close()} aria-controls={bodyId} className={TAP}>
                Cancel<span className="sr-only"> editing {title}</span>
              </Button>
            ) : (
              <Button variant="secondary" size="sm" leadingIcon={editIcon} onClick={open} aria-controls={bodyId} className={TAP}>
                {editLabel}
                <span className="sr-only">: {title}</span>
              </Button>
            )}
          </div>
        </div>
        <div id={bodyId} ref={bodyRef} className="px-4 py-5 sm:px-6">
          {/* Keyed, so switching between the summary and the form replays the entrance. */}
          <div key={editing ? "edit" : "view"} className="animate-fade-in">
            {editing ? children : summary}
          </div>
        </div>
      </section>
    </EditableSectionContext>
  );
}
