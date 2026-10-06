import { Check, ChevronDown, ShieldCheck } from "lucide-react";

import type { AdminConsentRecord } from "@/server/admin/types";

import { Timestamp } from "./timestamp";

/** The exact consent text a customer accepted, its version and when (collapsed by default). */
export function ConsentRecord({
  consent,
  title,
  timeZone,
}: {
  consent: AdminConsentRecord | null;
  title: string;
  timeZone: string;
}) {
  if (!consent) {
    return <p className="text-sm text-fg-subtle">No {title.toLowerCase()} is on file.</p>;
  }
  return (
    <details className="group rounded-xl border border-line bg-fg/[0.025] text-sm transition-colors open:border-line-strong">
      <summary className="flex list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-success-600" />
        <span className="min-w-0 flex-1 font-medium text-fg">
          {title}: accepted <Timestamp iso={consent.acceptedAt} timeZone={timeZone} />{" "}
          <span className="font-mono text-xs font-normal text-fg-subtle">v{consent.version}</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-subtle transition-transform duration-300 group-open:rotate-180" />
      </summary>
      <ul className="animate-slide-down space-y-2 border-t border-line px-4 py-3">
        {consent.items.map((item) => (
          <li key={item.key} className="flex gap-2 text-fg-muted">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-600" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
