"use client";

import { Info, Lightbulb, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { FieldErrorValue } from "@/components/ui/field-message";
import { RadioGroup } from "@/components/ui/radio-group";
import { cn } from "@/lib/cn";
import type { RequestCategoryOption } from "@/server/catalog/request-form";

/**
 * The kind of repair as radio cards with short definitions. Under the choices, the chosen
 * category says what helps mechanics quote it (MVP_PLAN section 4), any notice it carries
 * (the code-read "not a full diagnosis" note, safety-critical brake and suspension work) and
 * that a hidden fault needs a new estimate the customer approves first.
 */
export function CategoryField({
  categories,
  defaultValue,
  error,
}: {
  categories: readonly RequestCategoryOption[];
  defaultValue: string;
  error: FieldErrorValue;
}) {
  const [selected, setSelected] = useState(defaultValue);
  const chosen = categories.find((category) => category.id === selected);

  return (
    <div className="space-y-4">
      <RadioGroup
        name="categoryId"
        legend="What do you need?"
        hint="Pick the closest match. If you're not sure what's wrong, choose a diagnostic visit."
        variant="cards"
        columns={2}
        required
        defaultValue={defaultValue || undefined}
        onValueChange={setSelected}
        error={error}
        options={categories.map((category) => ({
          value: category.id,
          label: category.safetySensitive ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              {category.name}
              <Badge tone="warning" icon={<ShieldAlert />}>
                Safety-critical
              </Badge>
            </span>
          ) : (
            category.name
          ),
          hint: category.shortDescription,
        }))}
      />
      <div aria-live="polite">
        {chosen ? (
          <section
            key={chosen.id}
            aria-label={`About ${chosen.name}`}
            className="animate-slide-down space-y-3 rounded-2xl border border-brand-300/40 bg-linear-to-br from-brand-50 to-surface-2/60 p-4"
          >
            {chosen.customerNotice ? (
              <p
                className={cn(
                  "flex items-start gap-2.5 text-sm font-medium",
                  chosen.safetySensitive ? "text-warning-800" : "text-fg",
                )}
              >
                {chosen.safetySensitive ? (
                  <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-700" />
                ) : (
                  <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neon-cyan" />
                )}
                <span>{chosen.customerNotice}</span>
              </p>
            ) : null}
            <div className="flex items-start gap-2.5">
              <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neon-cyan" />
              <div className="min-w-0 space-y-0.5 text-sm">
                <p className="font-semibold text-fg">What helps mechanics quote</p>
                <p className="text-pretty text-fg-muted">Mention {lowerFirst(chosen.quoteHint)}</p>
              </div>
            </div>
            <p className="border-t border-line pt-3 text-xs text-pretty text-fg-muted">
              Quotes cover what you describe. If a mechanic finds a hidden fault once they start, any extra work needs
              a new estimate that you approve first.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** "What you notice…" → "what you notice…", so the hint reads on from "Mention". */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
