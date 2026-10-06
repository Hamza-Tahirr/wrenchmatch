"use client";

import { AnimatePresence, m } from "motion/react";
import { Camera, CircleCheck, ImagePlus, Trash2, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, useTransition, type ChangeEvent, type DragEvent } from "react";

import { initialsOf } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

import type { MediaAction } from "./dropzone";
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
import { isShrinkablePicture } from "./upload-budget";

export type AvatarUploaderProps = {
  /** Display name, for the initials shown without a picture. */
  name: string;
  /** Current picture URL (/api/files/<id>) or null. */
  currentSrc: string | null;
  maxBytes: number;
  /** The hosted site's upload rules: the picture is shrunk before it is sent. Absent locally. */
  budget?: UploadBudget;
  setAction: MediaAction;
  removeAction: MediaAction;
};

type Chosen = { file: File; url: string };

function tooLargeMessage(maxBytes: number): string {
  return `That picture is too large. It can be up to ${formatBytes(maxBytes)}.`;
}

function checkFile(file: File, maxBytes: number, budget: UploadBudget | undefined): string | null {
  const lower = file.name.toLowerCase();
  if (/\.(heic|heif)$/.test(lower) || file.type === "image/heic" || file.type === "image/heif") {
    return "That's a HEIC photo. HEIC photos aren't supported yet - please export as JPEG.";
  }
  const typeOk = PHOTO_MIME_TYPES.includes(file.type) || (file.type === "" && /\.(jpe?g|png|webp)$/.test(lower));
  if (!typeOk) return `Choose a ${PHOTO_TYPES_LABEL} image.`;
  if (file.size === 0) return "That file is empty. Choose it again.";
  // With a budget the picture is shrunk before it is sent; the limit applies to that copy.
  if (file.size > maxBytes && !(budget && isShrinkablePicture(file))) return tooLargeMessage(maxBytes);
  return null;
}

/**
 * Profile picture editor: a large round preview with a neon ring, choose or drop a picture,
 * preview it before saving, save or remove. The server re-encodes it (512 px) and removes
 * every bit of metadata (location included).
 */
export function AvatarUploader({ name, currentSrc, maxBytes, budget, setAction, removeAction }: AvatarUploaderProps) {
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [result, setResult] = useState<MediaActionState>(INITIAL_MEDIA_STATE);
  const [, startTransition] = useTransition();
  // Ends when the action answers; the page refresh that shows the new picture may come later.
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const pending = busy !== null;
  // What was just saved or removed, shown until the server sends the new picture.
  const [settled, setSettled] = useState<{ previousSrc: string | null; src: string | null } | null>(null);
  const waitingForServer = settled !== null && settled.previousSrc === currentSrc;
  const effectiveSrc = waitingForServer ? settled.src : currentSrc;

  const shownSrc = chosen?.url ?? effectiveSrc;
  // The <img> is keyed by the picture, not its URL: when the server's copy replaces the preview
  // that was just saved, the element stays, so the browser keeps showing the preview until the
  // copy has loaded (no blank circle, no second animation).
  const savedPreviewKey = settled !== null && !waitingForServer && settled.src !== null && currentSrc !== null ? settled.src : null;
  const shownKey = chosen?.url ?? savedPreviewKey ?? effectiveSrc;

  function choose(file: File | undefined) {
    if (!file) return;
    const issue = checkFile(file, maxBytes, budget);
    setResult(INITIAL_MEDIA_STATE);
    setConfirmRemove(false);
    if (issue) {
      setProblem(issue);
      return;
    }
    if (chosen) URL.revokeObjectURL(chosen.url);
    setProblem(null);
    setChosen({ file, url: URL.createObjectURL(file) });
  }

  function cancel() {
    if (chosen) URL.revokeObjectURL(chosen.url);
    setChosen(null);
    setProblem(null);
  }

  // The round preview opens the native picker even before the page hydrates; take over a
  // picture chosen that early once React attaches to the input.
  function attachInput(input: HTMLInputElement | null) {
    inputRef.current = input;
    const early = input?.files?.[0];
    if (!input || !early || chosen) return;
    input.value = "";
    choose(early);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    choose(event.currentTarget.files?.[0]);
    event.currentTarget.value = "";
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (!pending) choose(event.dataTransfer.files[0]);
  }

  function run(kind: "save" | "remove") {
    const formData = new FormData();
    if (kind === "save" && !chosen) return;
    const previous = result;
    setBusy(kind);
    startTransition(async () => {
      let next: MediaActionState;
      try {
        if (kind === "save" && chosen) {
          // The hosted site takes a few MB per request: send a shrunk copy there.
          const [file] = budget ? await shrinkPicturesFor([chosen.file], budget) : [chosen.file];
          if (budget && file.size > Math.min(maxBytes, budget.maxRequestBytes)) {
            setProblem(tooLargeMessage(Math.min(maxBytes, budget.maxRequestBytes)));
            return;
          }
          formData.append(PHOTO_FIELD, file, file.name);
        }
        next = await (kind === "save" ? setAction : removeAction)(previous, formData);
      } finally {
        setBusy(null);
      }
      setResult(next);
      if (next.message) (next.status === "success" ? toast.success : toast.error)(next.message);
      setConfirmRemove(false);
      if (next.status === "success") {
        // Keep showing the result (the preview stays alive as an object URL) until the refresh lands.
        setSettled({ previousSrc: currentSrc, src: kind === "save" && chosen ? chosen.url : null });
        if (kind === "save") setChosen(null);
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
      <div
        className="relative shrink-0"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute -inset-3 rounded-full bg-[conic-gradient(from_0deg,var(--color-neon-cyan),var(--color-neon-violet),var(--color-neon-blue),var(--color-neon-cyan))] opacity-60 blur-xl",
            "motion-safe:animate-spin-slow",
            dragging && "opacity-100",
          )}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "relative grid size-36 cursor-pointer place-items-center overflow-hidden rounded-full bg-elevated ring-2 ring-neon-cyan/60 transition-transform duration-300 sm:size-40",
            "shadow-glow-lg motion-safe:hover:scale-[1.03]",
            dragging && "ring-4 ring-neon-cyan motion-safe:scale-105",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {shownSrc ? (
              <m.img
                key={shownKey ?? shownSrc}
                src={shownSrc}
                alt={chosen ? "Preview of your new profile picture" : `Profile picture of ${name}`}
                width={160}
                height={160}
                className="size-full object-cover"
                initial={{ opacity: 0, scale: 1.08 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              />
            ) : (
              <m.span
                key="initials"
                className="font-display text-5xl font-semibold text-fg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                aria-label={`${name} has no profile picture`}
                role="img"
              >
                {initialsOf(name)}
              </m.span>
            )}
          </AnimatePresence>
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-linear-to-t from-canvas/90 to-transparent pt-6 pb-3 text-xs font-semibold text-fg opacity-90"
          >
            <Camera className="size-3.5" /> {shownSrc ? "Change" : "Add"}
          </span>
        </label>
        {chosen ? (
          <span className="absolute -top-1 -right-1 rounded-full bg-warning-600 px-2 py-0.5 text-[11px] font-bold text-on-brand shadow-glow-sm">
            Preview
          </span>
        ) : null}
      </div>

      <div className="w-full min-w-0 flex-1 space-y-4 text-center sm:text-left">
        <div className="space-y-1">
          {/* Opened by the "Choose" button (keyboard and screen readers) and by the round preview. */}
          <input
            ref={attachInput}
            id={inputId}
            type="file"
            accept={PHOTO_ACCEPT}
            onChange={handleChange}
            disabled={pending}
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
          <p id={hintId} className="text-sm text-fg-muted">
            {budget ? PHOTO_TYPES_LABEL : `${PHOTO_TYPES_LABEL}, up to ${formatBytes(maxBytes)}`}. Drop a picture on the circle or
            choose one. We resize it and remove all hidden data, location included.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
          {chosen ? (
            <>
              <Button
                onClick={() => run("save")}
                loading={busy === "save"}
                loadingText="Saving…"
                disabled={pending}
                leadingIcon={<CircleCheck aria-hidden="true" />}
              >
                Save picture
              </Button>
              <Button variant="ghost" onClick={cancel} disabled={pending}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
              aria-describedby={hintId}
              leadingIcon={<ImagePlus aria-hidden="true" />}
            >
              {effectiveSrc ? "Choose a new picture" : "Choose a picture"}
            </Button>
          )}

          {effectiveSrc && !chosen ? (
            confirmRemove ? (
              <span className="inline-flex items-center gap-2">
                <Button variant="danger" onClick={() => run("remove")} loading={busy === "remove"} loadingText="Removing…" disabled={pending}>
                  Remove picture
                </Button>
                <Button variant="ghost" onClick={() => setConfirmRemove(false)} disabled={pending}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmRemove(true)} disabled={pending} leadingIcon={<Trash2 aria-hidden="true" />}>
                Remove
              </Button>
            )
          ) : null}
        </div>

        <div aria-live="polite" className="empty:hidden">
          {problem ? (
            <p role="alert" className="flex items-center justify-center gap-2 text-sm font-medium text-danger-700 sm:justify-start">
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0" /> {problem}
            </p>
          ) : null}
          {!problem && result.status === "error" ? (
            <div role="alert" className="text-sm text-danger-700">
              <p className="flex items-center justify-center gap-2 font-medium sm:justify-start">
                <TriangleAlert aria-hidden="true" className="size-4 shrink-0" /> {result.message}
              </p>
              {result.errors.length > 0 ? (
                <ul className="mt-1 list-disc pl-6 text-left">
                  {result.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {!problem && result.status === "success" ? (
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-success-700 sm:justify-start">
              <CircleCheck aria-hidden="true" className="size-4 shrink-0" /> {result.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
