"use client";

import { AnimatePresence, m } from "motion/react";
import { CircleCheck, ImagePlus, TriangleAlert, UploadCloud, X } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatBytes, pluralize } from "@/lib/format";

import {
  INITIAL_MEDIA_STATE,
  PHOTO_ACCEPT,
  PHOTO_FIELD,
  PHOTO_MIME_TYPES,
  PHOTO_TYPES_LABEL,
  type MediaActionState,
  type UploadBudget,
} from "./media-types";
import { shrinkPicturesFor } from "./shrink-picture";
import { isShrinkablePicture, overBudgetMessage, totalBytes } from "./upload-budget";

/** A media Server Action (src/server/media/actions.ts). */
export type MediaAction = (state: MediaActionState, formData: FormData) => Promise<MediaActionState>;

export type DropzoneProps = {
  /** Receives the form's fields plus every chosen file under "photos". */
  action: MediaAction;
  /** Hidden fields sent with the files, e.g. { requestId }. */
  fields?: Readonly<Record<string, string>>;
  /** Files accepted in one upload. 1 = choosing again replaces the file. */
  maxFiles: number;
  /** Largest file accepted, in bytes. Checked early here; the server re-checks everything. */
  maxBytes: number;
  /**
   * The hosted site's upload rules (uploadBudgetFor): pictures are shrunk before they are
   * sent, so `maxBytes` applies to the shrunk copies, and an upload that would still be too
   * large for one request is stopped with a message. Absent locally: files go as chosen.
   */
  budget?: UploadBudget;
  /** Main line inside the drop area, e.g. "Add photos of the problem". */
  label: string;
  /** Second line; defaults to the accepted types and limits. */
  hint?: string;
  /** Submit button text before the count, e.g. "Add" gives "Add 3 photos". */
  submitVerb?: string;
  /** Extra form controls shown above the submit button (phase picker, caption...). */
  children?: ReactNode;
  /** Smaller drop area (e.g. inside a card). */
  compact?: boolean;
  className?: string;
};

type Chosen = { key: string; file: File; url: string };

function displayName(file: File): string {
  const name = file.name || "This file";
  return name.length > 48 ? `${name.slice(0, 45)}…` : name;
}

/**
 * Early, friendly checks; the server identifies every file by its bytes again. With a
 * budget, the size limit is checked after the pictures are shrunk (tooLargeAfterShrinking).
 */
function problemWith(file: File, maxBytes: number, budget: UploadBudget | undefined): string | null {
  const name = `“${displayName(file)}”`;
  const lower = file.name.toLowerCase();
  if (/\.(heic|heif)$/.test(lower) || file.type === "image/heic" || file.type === "image/heif") {
    return `${name} is a HEIC photo. HEIC photos aren't supported yet - please export as JPEG.`;
  }
  const typeOk = PHOTO_MIME_TYPES.includes(file.type) || (file.type === "" && /\.(jpe?g|png|webp)$/.test(lower));
  if (!typeOk) return `${name} isn't a ${PHOTO_TYPES_LABEL} image.`;
  if (file.size === 0) return `${name} is empty. Choose it again.`;
  if (file.size > maxBytes && !(budget && isShrinkablePicture(file))) {
    return `${name} is too large. Pictures can be up to ${formatBytes(maxBytes)} each.`;
  }
  return null;
}

/** Why shrunk pictures still can't be sent together under `budget`, or null when they can. */
function tooLargeAfterShrinking(files: readonly File[], maxBytes: number, budget: UploadBudget): string | null {
  const oversized = files.find((file) => file.size > maxBytes);
  if (oversized) return `“${displayName(oversized)}” is too large. Pictures can be up to ${formatBytes(maxBytes)} each.`;
  const advice = files.length > 1 ? "Remove some pictures and add them in a second upload." : "Choose a smaller picture.";
  return overBudgetMessage(totalBytes(files), budget, advice);
}

function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/**
 * Picture uploader: drag and drop, paste or click to choose, previews with remove buttons,
 * early type/size/count checks, a pending state while the Server Action stores the files,
 * and announced results. Works with the keyboard (the native file input stays focusable).
 */
export function Dropzone({
  action,
  fields,
  maxFiles,
  maxBytes,
  budget,
  label,
  hint,
  submitVerb = "Upload",
  children,
  compact = false,
  className,
}: DropzoneProps) {
  const inputId = useId();
  const hintId = useId();
  const statusId = useId();
  const keyCounter = useRef(0);
  const dragDepth = useRef(0);
  const [items, setItems] = useState<Chosen[]>([]);
  const [dragging, setDragging] = useState(false);
  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const [result, setResult] = useState<MediaActionState>(INITIAL_MEDIA_STATE);
  const [, startTransition] = useTransition();
  // Ends when the action answers; the page refresh the action triggers may render a little later.
  const [uploadingCount, setUploadingCount] = useState(0);
  // True while pictures are shrunk for the hosted site, before the upload itself starts.
  const [shrinking, setShrinking] = useState(false);
  const pending = uploadingCount > 0;

  const single = maxFiles === 1;
  const limitText = budget
    ? single
      ? `${PHOTO_TYPES_LABEL}, resized before sending`
      : `${PHOTO_TYPES_LABEL}, up to ${maxFiles} at a time, resized before sending (up to ${formatBytes(budget.maxRequestBytes)} per upload)`
    : single
      ? `${PHOTO_TYPES_LABEL}, up to ${formatBytes(maxBytes)}`
      : `${PHOTO_TYPES_LABEL}, up to ${maxFiles} at a time, ${formatBytes(maxBytes)} each`;

  function addFiles(list: readonly File[]) {
    if (list.length === 0) return;
    const problems: string[] = [];
    const accepted: Chosen[] = [];
    const current = single ? [] : items;
    let overflow = 0;
    for (const file of list) {
      const problem = problemWith(file, maxBytes, budget);
      if (problem) {
        problems.push(problem);
        continue;
      }
      if ([...current, ...accepted].some((item) => sameFile(item.file, file))) continue;
      if (current.length + accepted.length >= maxFiles) {
        overflow += 1;
        continue;
      }
      keyCounter.current += 1;
      accepted.push({ key: `${keyCounter.current}`, file, url: URL.createObjectURL(file) });
    }
    if (overflow > 0) {
      problems.push(`You can add up to ${pluralize(maxFiles, "picture")} at a time, so ${overflow} ${overflow === 1 ? "was" : "were"} left out.`);
    }
    if (single && accepted.length > 0) for (const item of items) URL.revokeObjectURL(item.url);
    setItems(single && accepted.length > 0 ? accepted.slice(0, 1) : [...current, ...accepted]);
    setLocalErrors(problems);
    setResult(INITIAL_MEDIA_STATE);
  }

  function removeItem(key: string) {
    const item = items.find((candidate) => candidate.key === key);
    if (item) URL.revokeObjectURL(item.url);
    setItems(items.filter((candidate) => candidate.key !== key));
    setLocalErrors([]);
  }

  function clearItems() {
    for (const item of items) URL.revokeObjectURL(item.url);
    setItems([]);
    setLocalErrors([]);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.currentTarget.files ?? []));
    // Lets the same file be chosen again after removing it.
    event.currentTarget.value = "";
  }

  // The native picker works before the page has hydrated (the label opens it), but React
  // only sees choices made afterwards: take over anything chosen earlier once attached.
  function adoptEarlySelection(input: HTMLInputElement | null) {
    if (!input?.files || input.files.length === 0 || items.length > 0) return;
    const early = Array.from(input.files);
    input.value = "";
    addFiles(early);
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (!pending) addFiles(Array.from(event.dataTransfer.files));
  }

  function handlePaste(event: ClipboardEvent<HTMLFormElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0 || pending) return;
    event.preventDefault();
    addFiles(files);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0 || pending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const chosen = items.map((item) => item.file);
    const previous = result;
    setUploadingCount(items.length);
    setShrinking(budget !== undefined);
    startTransition(async () => {
      let next: MediaActionState;
      try {
        // The hosted site takes a few MB per request: shrink first, and stop if that's not enough.
        const files = budget ? await shrinkPicturesFor(chosen, budget) : chosen;
        const tooLarge = budget ? tooLargeAfterShrinking(files, maxBytes, budget) : null;
        if (tooLarge) {
          setLocalErrors([tooLarge]);
          setResult(INITIAL_MEDIA_STATE);
          return;
        }
        setShrinking(false);
        for (const file of files) formData.append(PHOTO_FIELD, file, file.name);
        next = await action(previous, formData);
      } finally {
        setUploadingCount(0);
        setShrinking(false);
      }
      setResult(next);
      if (next.status === "success") {
        clearItems();
        // Extra controls (caption, phase) go back to their defaults for the next upload.
        form.reset();
        if (next.message) toast.success(next.message);
      } else if (next.message) {
        toast.error(next.message);
      }
    });
  }

  const errors = [...localErrors, ...(result.status === "error" ? result.errors : [])];
  const errorSummary = result.status === "error" ? result.message : null;

  return (
    <form onSubmit={handleSubmit} onPaste={handlePaste} className={cn("space-y-4", className)} aria-busy={pending}>
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="relative">
        <input
          ref={adoptEarlySelection}
          id={inputId}
          type="file"
          accept={PHOTO_ACCEPT}
          multiple={!single}
          disabled={pending}
          onChange={handleChange}
          aria-describedby={`${hintId} ${statusId}`}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed text-center",
            "transition-[border-color,background-color,box-shadow,transform] duration-300 ease-out",
            "border-line-strong bg-surface/60 hover:border-neon-cyan/60 hover:bg-surface-2/70",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-neon-cyan",
            "peer-disabled:cursor-progress peer-disabled:opacity-70",
            compact ? "px-4 py-5" : "px-6 py-9",
            dragging && "border-solid border-neon-cyan bg-brand-50/70 shadow-glow motion-safe:scale-[1.01]",
          )}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,color-mix(in_oklab,var(--color-neon-cyan)_14%,transparent),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
          <span
            aria-hidden="true"
            className={cn(
              "relative grid place-items-center rounded-2xl bg-brand-50 text-neon-cyan shadow-glow-sm ring-1 ring-neon-cyan/30",
              "transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-0.5",
              compact ? "size-11 [&_svg]:size-5" : "size-14 [&_svg]:size-6",
              dragging && "motion-safe:scale-110",
            )}
          >
            {dragging ? <UploadCloud /> : <ImagePlus />}
          </span>
          <span className="relative text-base font-semibold text-fg">{dragging ? "Drop to add" : label}</span>
          <span id={hintId} className="relative max-w-md text-sm text-fg-muted">
            {hint ?? "Drag pictures here, paste them, or click to choose."} {limitText}. Location data is removed.
          </span>
        </label>
      </div>

      {items.length > 0 ? (
        <ul className={cn("grid gap-3", single ? "grid-cols-1 sm:max-w-48" : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5")} aria-label="Chosen pictures">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <m.li
                key={item.key}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="group/thumb relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-2 shadow-elevated"
              >
                {/* Local preview (object URL); nothing is uploaded until the form is sent. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={`Preview of ${displayName(item.file)}`} className="size-full object-cover" />
                {pending ? <span aria-hidden="true" className="shimmer absolute inset-0 bg-transparent" /> : null}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-canvas/90 to-transparent px-2 pt-5 pb-1.5 text-left text-xs text-fg-muted tabular">
                  {formatBytes(item.file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  disabled={pending}
                  aria-label={`Remove ${displayName(item.file)}`}
                  className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-canvas/80 text-fg ring-1 ring-line-strong backdrop-blur transition-colors hover:bg-danger-700 hover:text-on-brand focus-visible:outline-2 focus-visible:outline-neon-cyan disabled:opacity-50"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}

      {children}

      {pending ? (
        <div className="space-y-2" role="status">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(90deg,transparent,var(--color-neon-cyan)_35%,var(--color-neon-violet)_65%,transparent)] motion-safe:animate-[wm-shimmer_1.2s_ease-in-out_infinite] motion-reduce:opacity-60"
            />
          </div>
          <p className="text-sm text-fg-muted">
            {shrinking
              ? `Resizing ${pluralize(uploadingCount, "picture")} for upload…`
              : `Uploading ${pluralize(uploadingCount, "picture")}: checking each file and removing location data…`}
          </p>
        </div>
      ) : null}

      <div id={statusId} aria-live="polite" className="space-y-2 empty:hidden">
        {!pending && result.status === "success" && result.message ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success-700">
            <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
            {result.message}
          </p>
        ) : null}
        {!pending && (errorSummary || errors.length > 0) ? (
          <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
            <p className="flex items-center gap-2 font-semibold">
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
              {errorSummary ?? "Some pictures can't be used."}
            </p>
            {errors.length > 0 ? (
              <ul className="mt-1.5 list-disc space-y-1 pl-6">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={items.length === 0}
          loading={pending}
          loadingText="Uploading…"
          leadingIcon={<UploadCloud aria-hidden="true" />}
        >
          {items.length > 0 ? `${submitVerb} ${pluralize(items.length, "picture")}` : `${submitVerb} pictures`}
        </Button>
        {items.length > 0 && !pending ? (
          <Button variant="ghost" onClick={clearItems}>
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}
