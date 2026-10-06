"use client";

import { FileText, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import type { UploadBudget } from "@/components/media/media-types";
import { useShrinkOnChoose } from "@/components/media/use-shrink-on-choose";
import { cn } from "@/lib/cn";
import { formatBytes, pluralize } from "@/lib/format";
import { joinIds } from "./field-id";

export type FileInputProps = Omit<ComponentProps<"input">, "type" | "ref"> & {
  /** Human-readable accepted types, e.g. "JPEG, PNG or WebP". */
  acceptLabel?: string;
  /** Human-readable limits, e.g. "Up to 5 photos, 8 MB each". */
  limitLabel?: string;
  /** Used only to warn early; the server re-validates every file. */
  maxFiles?: number;
  /** Used only to warn early; the server re-validates every file. */
  maxFileSizeBytes?: number;
  /**
   * The hosted site's upload rules: chosen pictures are replaced by shrunk copies before the
   * form is sent (other files are kept as they are). Absent locally.
   */
  budget?: UploadBudget;
};

type ChosenFile = { name: string; size: number };

/**
 * Styled native file input that states accepted types and limits and lists the chosen
 * files. Wrap in <Field> for its label, hint and error.
 */
export function FileInput({
  acceptLabel,
  limitLabel,
  maxFiles,
  maxFileSizeBytes,
  budget,
  id,
  className,
  onChange,
  "aria-describedby": describedBy,
  ...props
}: FileInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const detailsId = acceptLabel || limitLabel ? `${inputId}-details` : undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ChosenFile[]>([]);
  const { shrinking, shrinkChosen } = useShrinkOnChoose(budget);

  // Forms are reset after a successful Server Action; clear the list with them.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => setFiles([]);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  function list(chosen: readonly File[]): ChosenFile[] {
    return chosen.map((file) => ({ name: file.name, size: file.size }));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const chosen = Array.from(input.files ?? []);
    setFiles(list(chosen));
    onChange?.(event);
    // On the hosted site, chosen pictures are swapped for shrunk copies (a no-op locally).
    void shrinkChosen(input, chosen).then((shrunk) => {
      if (shrunk) setFiles(list(shrunk));
    });
  }

  const tooMany = maxFiles !== undefined && files.length > maxFiles;
  // Pictures being shrunk are judged by their shrunk copies, once those are ready.
  const isTooLarge = (file: ChosenFile) => !shrinking && maxFileSizeBytes !== undefined && file.size > maxFileSizeBytes;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        aria-describedby={joinIds(describedBy, detailsId)}
        onChange={handleChange}
        className={cn(
          "block w-full cursor-pointer rounded-xl border border-dashed border-control bg-surface-2/70 p-2 text-sm text-fg-muted transition-[border-color,box-shadow] duration-200 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-neon-cyan/12 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800 hover:border-neon-cyan/60 hover:file:bg-neon-cyan/20 focus-visible:border-neon-cyan focus-visible:shadow-glow-sm focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-neon-cyan disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger-500",
          className,
        )}
        {...props}
      />
      {detailsId ? (
        <p id={detailsId} className="text-sm text-fg-muted">
          {[acceptLabel, limitLabel].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <div aria-live="polite" className="space-y-2">
        {shrinking ? <p className="text-sm text-fg-muted">Resizing photos for upload…</p> : null}
        {files.length > 0 ? (
          <>
            <p className="sr-only">{pluralize(files.length, "file")} chosen.</p>
            <ul className="glass-lite divide-y divide-line rounded-xl text-sm">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-2 px-3 py-2">
                  <FileText aria-hidden="true" className="size-4 shrink-0 text-neon-cyan" />
                  <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      isTooLarge(file) ? "font-medium text-danger-700" : "text-fg-subtle",
                    )}
                  >
                    {formatBytes(file.size)}
                    {isTooLarge(file) ? " (over the limit)" : null}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {tooMany ? (
          <p className="flex items-start gap-1.5 text-sm font-medium text-warning-800">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            You chose {pluralize(files.length, "file")}; the limit is {maxFiles}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
