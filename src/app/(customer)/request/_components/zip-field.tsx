"use client";

import { ChevronDown, CircleCheck, MapPinned, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Field } from "@/components/ui/field";
import type { FieldErrorValue } from "@/components/ui/field-message";
import { Input } from "@/components/ui/input";
import type { Coverage } from "@/server/catalog/coverage";
import type { PilotArea } from "@/server/catalog/pilot-zips";

import { CoveragePreview } from "./coverage-preview";

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** "85281" from "85281" or "85281-1234" (what the server accepts), else null. */
function fiveDigitZip(value: string): string | null {
  const match = /^(\d{5})(?:-\d{4})?$/.exec(value.trim());
  return match ? match[1] : null;
}

/**
 * The ZIP code with an instant pilot-area check against the enabled pilot ZIPs, and a map
 * preview of the ZIP's approximate area once it is one we serve. The server checks the ZIP
 * again when the form is sent (an admin may change the pilot meanwhile).
 */
export function ZipField({
  defaultValue,
  error,
  pilotAreas,
  coverage,
}: {
  defaultValue: string;
  error: FieldErrorValue;
  pilotAreas: readonly PilotArea[];
  coverage: Coverage;
}) {
  const [zip, setZip] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  // Typed before the page finished loading: pick up what is in the box.
  useEffect(() => {
    const typedEarly = inputRef.current?.value;
    if (typedEarly !== undefined && typedEarly !== defaultValue) setZip(typedEarly);
  }, [defaultValue]);
  const lookup = useMemo(() => new Map(coverage.zips.map((point) => [point.zip, point])), [coverage]);
  const metros = joinLabels(pilotAreas.map((area) => area.metroLabel));
  const typed = fiveDigitZip(zip);
  const match = typed ? lookup.get(typed) : undefined;
  // The server's message already explains a refused ZIP until the person changes it.
  const showCheck = typed !== null && !(error && zip === defaultValue);

  return (
    <div className="space-y-3">
      <Field
        label="ZIP code"
        name="zip"
        required
        error={error}
        hint={pilotAreas.length > 0 ? `Where the car is. We currently serve the ${metros}.` : "Where the car is."}
      >
        <Input
          ref={inputRef}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          defaultValue={defaultValue}
          onChange={(event) => setZip(event.currentTarget.value)}
          className="font-mono tracking-[0.2em] sm:max-w-52"
        />
      </Field>
      <div aria-live="polite" className="text-sm">
        {showCheck && match ? (
          <p className="inline-flex animate-scale-in items-start gap-2 rounded-full border border-success-300/50 bg-success-50 px-3 py-1.5 font-medium text-success-800 shadow-glow-success">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {match.city}, {match.state} {match.zip} is in our {match.metroLabel} service area.
          </p>
        ) : null}
        {showCheck && !match ? (
          <p className="inline-flex animate-scale-in items-start gap-2 rounded-xl border border-warning-300/50 bg-warning-50 px-3 py-2 font-medium text-warning-800">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {pilotAreas.length > 0
              ? `${typed} isn't in our service area yet. We currently serve the ${metros}.`
              : "We aren't taking repair requests in any area right now."}
          </p>
        ) : null}
      </div>
      {showCheck && match ? <CoveragePreview selected={match} coverage={coverage} /> : null}
      {pilotAreas.length > 0 ? (
        <details className="group text-sm">
          <summary className="inline-flex min-h-11 items-center gap-1.5 rounded-md font-medium text-brand-700 hover:text-brand-800">
            <MapPinned aria-hidden="true" className="size-4" />
            See the ZIP codes we cover
            <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 space-y-3 rounded-2xl border border-line bg-surface-2/60 p-4">
            {pilotAreas.map((area) => (
              <div key={area.metroLabel}>
                <p className="font-medium text-fg">{area.metroLabel}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {area.zips.map((entry) => (
                    <li
                      key={entry.zip}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg-muted"
                    >
                      <span className="font-mono font-medium text-fg tabular-nums">{entry.zip}</span> {entry.city}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
