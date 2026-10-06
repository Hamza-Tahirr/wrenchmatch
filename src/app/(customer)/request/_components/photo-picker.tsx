"use client";

import { Film, ImagePlus, TriangleAlert, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import type { UploadBudget } from "@/components/media/media-types";
import { replaceInputFiles } from "@/components/media/upload-budget";
import { useShrinkOnChoose } from "@/components/media/use-shrink-on-choose";
import { cn } from "@/lib/cn";
import { formatBytes, pluralize } from "@/lib/format";

// The request form's photo and video picker: a drop zone around a real file input, so the
// files are sent with the request itself (the media Dropzone uploads on its own, which fits
// pages where the request already exists). Previews, remove buttons and early checks are
// conveniences; the server validates every file again by its bytes.

/** `key` comes from the file as chosen and stays when the file is swapped for a shrunk copy. */
type Chosen = { key: string; file: File; preview: string | null };
type Entry = Pick<Chosen, "key" | "file">;

export type PhotoPickerProps = {
  /** From <Field>: id, name, aria-describedby, aria-invalid. */
  id?: string;
  name?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  kind: "photos" | "video";
  accept: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  acceptLabel: string;
  limitLabel: string;
  /** The hosted site's upload rules: chosen photos are swapped for shrunk copies. Absent locally. */
  budget?: UploadBudget;
};

function keyOf(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function entryOf(file: File): Entry {
  return { key: keyOf(file), file };
}

function entriesOf(items: readonly Chosen[]): Entry[] {
  return items.map(({ key, file }) => ({ key, file }));
}

function warningFor(file: File, kind: PhotoPickerProps["kind"], maxBytes: number, accept: readonly string[]): string | null {
  const lower = file.name.toLowerCase();
  if (kind === "photos" && (/\.(heic|heif)$/.test(lower) || file.type === "image/heic" || file.type === "image/heif")) {
    return `“${file.name}” is a HEIC photo: please export it as JPEG first.`;
  }
  if (file.type && !accept.includes(file.type)) return `“${file.name}” isn't a supported file type.`;
  if (file.size > maxBytes) return `“${file.name}” is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`;
  return null;
}

export function PhotoPicker({
  id,
  name,
  required,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  kind,
  accept,
  maxFiles,
  maxFileSizeBytes,
  acceptLabel,
  limitLabel,
  budget,
}: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [dragging, setDragging] = useState(false);
  // Videos are sent as chosen; only photos are shrunk.
  const { shrinking, shrinkChosen } = useShrinkOnChoose(kind === "photos" ? budget : undefined);
  const acceptList = accept.split(",").map((type) => type.trim());
  const multiple = maxFiles > 1;
  const detailsId = id ? `${id}-limits` : undefined;

  // Object URLs for previews are released when the list changes or the picker unmounts.
  useEffect(() => {
    return () => {
      for (const item of chosen) if (item.preview) URL.revokeObjectURL(item.preview);
    };
  }, [chosen]);

  // Forms reset after a successful action; clear the list with them.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => setChosen([]);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  function withPreviews(entries: readonly Entry[]): Chosen[] {
    return entries.map(({ key, file }) => ({
      key,
      file,
      preview: kind === "photos" && file.type.startsWith("image/") && !/hei[cf]/.test(file.type) ? URL.createObjectURL(file) : null,
    }));
  }

  /**
   * Puts the files into the real input (what the form sends) and the preview list. On the
   * hosted site the photos are then swapped for shrunk copies, in both places.
   */
  function commit(entries: readonly Entry[]) {
    const input = inputRef.current;
    if (!input) return;
    const files = entries.map((entry) => entry.file);
    replaceInputFiles(input, files);
    setChosen(withPreviews(entries));
    void shrinkChosen(input, files).then((shrunk) => {
      if (shrunk) setChosen(withPreviews(shrunk.map((file, index) => ({ key: entries[index].key, file }))));
    });
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    commit(Array.from(event.currentTarget.files ?? [], entryOf));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length === 0) return;
    if (!multiple) {
      commit(dropped.slice(0, 1).map(entryOf));
      return;
    }
    const existing = entriesOf(chosen);
    const known = new Set(existing.map((entry) => entry.key));
    commit([...existing, ...dropped.map(entryOf).filter((entry) => !known.has(entry.key))]);
  }

  function remove(key: string) {
    commit(entriesOf(chosen.filter((item) => item.key !== key)));
    inputRef.current?.focus();
  }

  // Photos being shrunk are judged by their shrunk copies, once those are ready.
  const warnings = chosen
    .map((item) => warningFor(item.file, kind, shrinking ? Number.POSITIVE_INFINITY : maxFileSizeBytes, acceptList))
    .filter((warning): warning is string => warning !== null);
  const tooMany = chosen.length > maxFiles;
  const Icon = kind === "video" ? Film : ImagePlus;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed px-4 py-6 text-center transition-all duration-200",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-neon-cyan",
          dragging
            ? "border-neon-cyan bg-neon-cyan/10 shadow-glow"
            : invalid
              ? "border-danger-400 bg-danger-50/40"
              : "border-control bg-surface-2/50 hover:border-brand-400 hover:bg-brand-50/40",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-11 place-items-center rounded-xl border border-brand-300/40 bg-brand-50 text-neon-cyan transition-transform duration-300",
            dragging ? "scale-110" : "group-hover:-translate-y-0.5",
          )}
        >
          {dragging ? <UploadCloud className="size-5" /> : <Icon className="size-5" />}
        </span>
        <p className="text-sm font-medium text-fg">
          {dragging ? "Drop to add" : kind === "video" ? "Drop a video or browse" : "Drop photos or browse"}
        </p>
        <p id={detailsId} className="text-xs text-fg-subtle">
          {acceptLabel} · {limitLabel}
        </p>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept={accept}
          multiple={multiple}
          required={required}
          aria-invalid={invalid}
          aria-describedby={[describedBy, detailsId].filter(Boolean).join(" ") || undefined}
          onChange={onChange}
          onClick={(event) => event.stopPropagation()}
          className="sr-only"
        />
      </div>

      <div aria-live="polite" className="space-y-2">
        {shrinking ? <p className="text-sm text-fg-muted">Resizing photos for upload…</p> : null}
        {chosen.length > 0 ? (
          <>
            <p className="sr-only">{pluralize(chosen.length, kind === "video" ? "video" : "photo")} chosen.</p>
            <ul className={cn("grid gap-2", kind === "photos" ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-1")}>
              {chosen.map((item) => (
                <li
                  key={item.key}
                  className={cn(
                    "group/tile relative animate-scale-in overflow-hidden rounded-xl border border-line bg-surface-2",
                    kind === "photos" ? "aspect-square" : "flex items-center gap-3 p-2.5",
                  )}
                >
                  {item.preview ? (
                    // Local preview of a file that hasn't been uploaded yet (an object URL).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.preview} alt="" className="size-full object-cover" />
                  ) : kind === "photos" ? (
                    <span className="grid size-full place-items-center text-fg-subtle">
                      <ImagePlus aria-hidden="true" className="size-6" />
                    </span>
                  ) : (
                    <>
                      <Film aria-hidden="true" className="size-5 shrink-0 text-neon-cyan" />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.file.name}</span>
                      <span className="shrink-0 font-mono text-xs text-fg-subtle tabular">{formatBytes(item.file.size)}</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(item.key)}
                    className={cn(
                      "grid size-8 place-items-center rounded-lg bg-canvas/85 text-fg shadow-elevated backdrop-blur-sm transition-colors after:absolute after:-inset-2 hover:bg-danger-100 hover:text-danger-800",
                      kind === "photos" ? "absolute top-1.5 right-1.5" : "relative shrink-0",
                    )}
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {tooMany ? (
          <p className="flex items-start gap-1.5 text-sm font-medium text-warning-800">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            You chose {pluralize(chosen.length, "file")}; the limit is {maxFiles}. Remove {chosen.length - maxFiles}.
          </p>
        ) : null}
        {warnings.map((warning) => (
          <p key={warning} className="flex items-start gap-1.5 text-sm font-medium text-warning-800">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {warning}
          </p>
        ))}
      </div>
    </div>
  );
}
