"use client";

import { ChevronDown, Link2, Search, X } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "@/components/ui/toast";

export type FaqItem = {
  id: string;
  question: string;
  /** Extra words people might search for. */
  keywords: string;
  answer: ReactNode;
};

async function copyLink(id: string, question: string) {
  const url = `${window.location.origin}/help#${id}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied", { description: `Share it to point someone straight at “${question}”` });
  } catch {
    toast.error("Could not copy the link", { description: url });
  }
}

/** Searchable FAQ accordion (native <details>, so every answer also works without JavaScript). */
export function FaqSearch({ items }: { items: readonly FaqItem[] }) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const statusId = useId();
  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!normalized) return new Set(items.map((item) => item.id));
    const words = normalized.split(/\s+/);
    return new Set(
      items
        .filter((item) => {
          const haystack = `${item.question} ${item.keywords}`.toLowerCase();
          return words.every((word) => haystack.includes(word));
        })
        .map((item) => item.id),
    );
  }, [items, normalized]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <label htmlFor={inputId} className="sr-only">
          Search questions
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-neon-cyan" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search questions: quotes, payments, photos, privacy…"
          aria-describedby={statusId}
          autoComplete="off"
          className="block w-full rounded-2xl border border-control bg-surface-2/80 py-3.5 pr-12 pl-12 text-base text-fg shadow-[inset_0_1px_0_0_oklch(1_0_0/0.04)] transition-[border-color,box-shadow] duration-200 placeholder:text-fg-subtle hover:border-brand-400 focus-visible:border-neon-cyan focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-neon-cyan)_20%,transparent),0_0_28px_-6px_var(--color-neon-cyan)] focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-neon-cyan [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute top-1/2 right-3 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-fg/[0.08] hover:text-fg"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">Clear search</span>
          </button>
        ) : null}
      </div>
      <p id={statusId} aria-live="polite" className="text-sm text-fg-subtle">
        {normalized
          ? visible.size === 0
            ? "No questions match. Try another word, or ask Support."
            : `${visible.size} of ${items.length} questions match.`
          : `${items.length} questions`}
      </p>
      <div className="glass-lite divide-y divide-line overflow-hidden rounded-2xl">
        {items.map((item) => (
          <details key={item.id} id={item.id} hidden={!visible.has(item.id)} className="group scroll-mt-28">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-fg transition-colors hover:bg-fg/[0.04] group-open:bg-neon-cyan/[0.05] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-fg-subtle transition-colors group-open:bg-neon-cyan group-open:shadow-[0_0_10px_var(--color-neon-cyan)]"
                />
                {item.question}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-5 shrink-0 text-fg-subtle transition-transform duration-300 group-open:rotate-180 group-open:text-neon-cyan"
              />
            </summary>
            <div className="animate-slide-down space-y-3 px-5 pt-1 pb-5 pl-[2.375rem] text-fg-muted [&_a]:font-medium [&_a]:text-brand-700 [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-fg">
              <div className="space-y-3">{item.answer}</div>
              <button
                type="button"
                onClick={() => void copyLink(item.id, item.question)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-fg-subtle transition-colors hover:bg-fg/[0.06] hover:text-fg"
              >
                <Link2 aria-hidden="true" className="size-3.5" />
                Copy link<span className="sr-only"> to this answer</span>
              </button>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
