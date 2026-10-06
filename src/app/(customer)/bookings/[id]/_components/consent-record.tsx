import { ChevronDown, FileCheck } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import type { ConsentRecord as ConsentRecordData } from "@/server/customer/snapshots";

/** The exact statements the customer accepted when reserving, with the version and time. */
export function ConsentRecord({ consent, timeZone }: { consent: ConsentRecordData | null; timeZone: string }) {
  return (
    <section aria-labelledby="consent-title" className="glass-lite rounded-3xl">
      <details className="group">
        <summary className="flex items-start justify-between gap-3 rounded-3xl px-5 py-4 transition-colors hover:bg-fg/5 sm:px-6">
          <span className="min-w-0 space-y-1">
            <span className="block font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase">Record</span>
            <span id="consent-title" className="flex items-center gap-2 font-display text-base font-semibold text-fg">
              <FileCheck aria-hidden="true" className="size-4 text-neon-cyan" />
              Your consent record
            </span>
            {consent ? (
              <span className="block text-sm text-fg-muted">
                Accepted <time dateTime={consent.acceptedAt}>{formatDateTime(consent.acceptedAt, timeZone)}</time> ·
                version <span className="font-mono">{consent.version}</span>
              </span>
            ) : null}
          </span>
          <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-5 py-4 sm:px-6">
          {consent ? (
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              {consent.items.map((item) => (
                <li key={item.key}>{item.text}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">No consent record is stored for this booking.</p>
          )}
        </div>
      </details>
    </section>
  );
}
