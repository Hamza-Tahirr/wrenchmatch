"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Alert, Callout } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { formatDate, formatDateTime } from "@/lib/format";
import type { FieldErrors } from "@/lib/validation/mechanic";
import { QUOTE_LIMITS, type QuoteFormValues } from "@/lib/validation/quote";
import type { QuoteFormDefaults } from "@/server/mechanic/jobs";

import { DURATION_CHOICES, formatDuration } from "../../../_lib/display";
import { CountUp } from "../../../_components/count-up";
import { BAR_CLEARANCE } from "../../../_components/tap";
import { useVersionedActionState } from "../../../_components/use-versioned-action-state";
import { submitQuoteAction, type QuoteFormState } from "../../actions";
import { AmountRows, PartRows, type AmountRow, type PartRow } from "./quote-line-rows";
import { previewTotals, QuoteTotalPreview, type PreviewTotals } from "./quote-total-preview";

// The quote form of a matched job. Prices are typed in dollars; the server turns them into
// integer cents and computes every total (the previews here are display-only). The send bar
// sticks to the bottom of the screen while the form is in view, with the live total.

const FIELD_LABELS: Readonly<Record<string, string>> = {
  laborPrice: "Labor price",
  partsIncluded: "Parts included",
  parts: "Parts",
  taxes: "Taxes",
  fees: "Fees",
  earliestStart: "Earliest start",
  durationMinutes: "Estimated duration",
  serviceMode: "Where you'll do the work",
  scope: "What the price covers",
  exclusions: "Exclusions",
  notes: "Notes for the customer",
  validityHours: "Quote valid for",
};

/** FormErrorSummary labels, including the numbered row inputs of the submitted values. */
function errorLabels(values: QuoteFormValues): Record<string, string> {
  const labels: Record<string, string> = { ...FIELD_LABELS };
  values.parts.forEach((_, index) => {
    labels[`parts.${index}.description`] = `Part ${index + 1} description`;
    labels[`parts.${index}.quantity`] = `Part ${index + 1} quantity`;
    labels[`parts.${index}.unitPrice`] = `Part ${index + 1} price`;
  });
  for (const group of ["taxes", "fees"] as const) {
    const noun = group === "taxes" ? "Tax" : "Fee";
    values[group].forEach((_, index) => {
      labels[`${group}.${index}.description`] = `${noun} ${index + 1} description`;
      labels[`${group}.${index}.amount`] = `${noun} ${index + 1} amount`;
    });
  }
  return labels;
}

type QuoteFormProps = {
  requestId: string;
  defaults: QuoteFormDefaults;
};

export function QuoteForm({ requestId, defaults }: QuoteFormProps) {
  const [state, dispatch, version] = useVersionedActionState<QuoteFormState>(submitQuoteAction, { ok: false });
  const values = !state.ok && state.values ? state.values : defaults.values;
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  // A refused submit is listed in the error summary (the source of truth); a toast flags it too.
  const toasted = useRef(0);
  useEffect(() => {
    if (version === 0 || toasted.current === version || state.ok) return;
    toasted.current = version;
    toast.error("Your quote wasn't sent", {
      description: state.code === "slot_conflict" ? "That time overlaps another commitment." : "Check the highlighted fields.",
    });
  }, [version, state]);
  return (
    // Focused fields keep clear of the send bar (scroll margin).
    <form
      key={version}
      action={dispatch}
      noValidate
      className={`space-y-8 ${BAR_CLEARANCE}`}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <FormErrorSummary
        title="Your quote wasn't sent"
        formError={state.ok ? null : state.formError}
        fieldErrors={errors}
        labels={errorLabels(values)}
        focusKey={version}
      />
      <QuoteFields values={values} errors={errors} defaults={defaults} slotConflict={!state.ok && state.code === "slot_conflict"} />
    </form>
  );
}

type SectionProps = { values: QuoteFormValues; errors: FieldErrors };

/** The editable price rows, kept here so the price section and the send bar share one total. */
function usePriceRows(values: QuoteFormValues) {
  const [labor, setLabor] = useState(values.laborPrice);
  const [partsIncluded, setPartsIncluded] = useState(values.partsIncluded);
  const [parts, setParts] = useState<PartRow[]>(() =>
    (values.parts.length > 0 ? values.parts : [{ description: "", quantity: "1", unitPrice: "" }]).map((row, index) => ({
      key: `part-${index}`,
      ...row,
    })),
  );
  const [taxes, setTaxes] = useState<AmountRow[]>(() => values.taxes.map((row, index) => ({ key: `tax-${index}`, ...row })));
  const [fees, setFees] = useState<AmountRow[]>(() => values.fees.map((row, index) => ({ key: `fee-${index}`, ...row })));
  return { labor, setLabor, partsIncluded, setPartsIncluded, parts, setParts, taxes, setTaxes, fees, setFees };
}

type PriceRows = ReturnType<typeof usePriceRows>;

/** Everything inside the form; it remounts with the form after a refused submit. */
function QuoteFields({
  values,
  errors,
  defaults,
  slotConflict,
}: SectionProps & { defaults: QuoteFormDefaults; slotConflict: boolean }) {
  const price = usePriceRows(values);
  const totals = previewTotals(price);
  return (
    <>
      <PriceSection price={price} totals={totals} errors={errors} />
      <TimeSection values={values} errors={errors} defaults={defaults} slotConflict={slotConflict} />
      <ScopeSection values={values} errors={errors} />
      <ValiditySection values={values} errors={errors} defaults={defaults} />
      <SendBar totalCents={totals.totalCents} />
    </>
  );
}

const SECTION_STEPS: Readonly<Record<string, number>> = {
  "quote-price-title": 1,
  "quote-time-title": 2,
  "quote-scope-title": 3,
  "quote-send-title": 4,
};

/** Numbered neon step marker + section heading. */
function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h3 id={id} className="flex items-center gap-3 font-display text-lg font-semibold tracking-tight text-fg">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-neon-cyan to-neon-blue font-mono text-sm font-bold text-on-brand shadow-glow-sm"
      >
        {SECTION_STEPS[id]}
      </span>
      {children}
    </h3>
  );
}

function PriceSection({ price, totals, errors }: { price: PriceRows; totals: PreviewTotals; errors: FieldErrors }) {
  return (
    <section aria-labelledby="quote-price-title" className="space-y-5">
      <SectionTitle id="quote-price-title">Price</SectionTitle>
      <Field
        label="Labor price (USD)"
        hint="Your price for the work itself. The provisional 10% platform fee is taken from labor and deducted from your payout."
        error={errors.laborPrice}
        required
      >
        <Input
          name="laborPrice"
          inputMode="decimal"
          leadingText="$"
          placeholder="120.00"
          value={price.labor}
          onChange={(event) => price.setLabor(event.currentTarget.value)}
          className="sm:max-w-xs"
        />
      </Field>
      <RadioGroup
        name="partsIncluded"
        legend="Does your price include parts?"
        variant="cards"
        columns={2}
        required
        defaultValue={price.partsIncluded}
        onValueChange={price.setPartsIncluded}
        error={errors.partsIncluded}
        options={[
          { value: "yes", label: "Yes, parts included", hint: "List the parts and their prices below." },
          {
            value: "no",
            label: "No, labor only",
            hint: "The customer buys or supplies parts. Say what's needed in Exclusions or Notes.",
          },
        ]}
      />
      {/* Hidden part rows aren't submitted, so a labor-only quote never carries parts. */}
      {price.partsIncluded === "yes" ? <PartRows rows={price.parts} setRows={price.setParts} errors={errors} /> : null}
      <AmountRows group="taxes" rows={price.taxes} setRows={price.setTaxes} errors={errors} />
      <AmountRows group="fees" rows={price.fees} setRows={price.setFees} errors={errors} />
      <QuoteTotalPreview totals={totals} partsIncluded={price.partsIncluded} />
    </section>
  );
}

function TimeSection({
  values,
  errors,
  defaults,
  slotConflict,
}: SectionProps & { defaults: QuoteFormDefaults; slotConflict: boolean }) {
  const durationValue = Number(values.durationMinutes);
  const durationChoices: number[] = [...DURATION_CHOICES];
  if (Number.isInteger(durationValue) && durationValue > 0 && !durationChoices.includes(durationValue)) {
    durationChoices.push(durationValue);
    durationChoices.sort((a, b) => a - b);
  }
  return (
    <section aria-labelledby="quote-time-title" className="space-y-5 border-t border-line pt-8">
      <SectionTitle id="quote-time-title">Time and place</SectionTitle>
      {slotConflict ? (
        <Alert
          tone="warning"
          title="That time overlaps another commitment"
          actions={
            <Link
              href="/mechanic/jobs?tab=quotes"
              className="inline-flex min-h-11 items-center text-sm font-medium text-warning-800 underline underline-offset-2 sm:min-h-0"
            >
              See your active quotes
            </Link>
          }
        >
          <p>
            A submitted quote holds its time slot until it expires, and bookings hold theirs too. Choose a start time that
            doesn&rsquo;t overlap them, or withdraw the other quote first.
          </p>
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field
          label={`Earliest start (${defaults.timeZoneLabel}, the job's local time)`}
          hint={
            <>
              At least 1 hour from now and within 30 days.
              {defaults.insuranceExpiresOn
                ? ` Your insurance must still be valid that day (it expires ${formatDate(defaults.insuranceExpiresOn)}).`
                : null}
            </>
          }
          error={errors.earliestStart}
          required
        >
          <Input
            name="earliestStart"
            type="datetime-local"
            step={900}
            min={defaults.earliestStartLocal}
            max={defaults.latestStartLocal}
            defaultValue={values.earliestStart}
          />
        </Field>
        <Field label="Estimated duration" hint="How long the job takes once you start." error={errors.durationMinutes} required>
          <Select name="durationMinutes" defaultValue={values.durationMinutes}>
            {durationChoices.map((minutes) => (
              <option key={minutes} value={String(minutes)}>
                {formatDuration(minutes)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <RadioGroup
        name="serviceMode"
        legend="Where you'll do the work"
        hint="Only the options that fit this request, your service modes and the distance are offered."
        variant="cards"
        columns={2}
        required
        defaultValue={values.serviceMode}
        error={errors.serviceMode}
        options={defaults.allowedServiceModes.map((mode) => ({ value: mode.value, label: mode.label, hint: mode.description }))}
      />
    </section>
  );
}

function ScopeSection({ values, errors }: SectionProps) {
  return (
    <section aria-labelledby="quote-scope-title" className="space-y-5 border-t border-line pt-8">
      <SectionTitle id="quote-scope-title">Scope</SectionTitle>
      <Field
        label="What the price covers"
        hint="The work you'll do and the checks included. Hidden faults found later need a change order the customer approves."
        error={errors.scope}
        required
      >
        <Textarea name="scope" rows={4} maxLength={QUOTE_LIMITS.scopeMax} defaultValue={values.scope} />
      </Field>
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label="Exclusions" hint="What isn't included." error={errors.exclusions} optional>
          <Textarea name="exclusions" rows={3} maxLength={QUOTE_LIMITS.exclusionsMax} defaultValue={values.exclusions} />
        </Field>
        <Field
          label="Notes for the customer"
          hint="No phone numbers or emails: contact details are shared after a confirmed booking."
          error={errors.notes}
          optional
        >
          <Textarea name="notes" rows={3} maxLength={QUOTE_LIMITS.notesMax} defaultValue={values.notes} />
        </Field>
      </div>
    </section>
  );
}

function ValiditySection({ values, errors, defaults }: SectionProps & { defaults: QuoteFormDefaults }) {
  return (
    <section aria-labelledby="quote-send-title" className="space-y-5 border-t border-line pt-8">
      <SectionTitle id="quote-send-title">Validity</SectionTitle>
      <Field
        label="Quote valid for"
        hint={
          <>
            It also ends at your offered start time
            {defaults.requestExpiresAt
              ? ` or when the request closes (${formatDateTime(defaults.requestExpiresAt, defaults.timeZone)})`
              : null}
            , whichever comes first.
          </>
        }
        error={errors.validityHours}
        required
      >
        <Select name="validityHours" defaultValue={values.validityHours} className="sm:max-w-xs">
          {defaults.validityOptions.map((option) => (
            <option key={option.hours} value={String(option.hours)}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Callout tone="warning" title="Sending commits this time slot until the quote expires">
        <p>
          While the quote is open you can&rsquo;t offer an overlapping time on another job. If the customer selects it, the
          reservation is created without a second approval from you. Withdraw the quote to release the slot.
        </p>
      </Callout>
    </section>
  );
}

/**
 * The form's one submit button, with the live total. It sticks to the bottom of the screen
 * while the form is in view and rests at the end of the form; it pads for the safe area.
 */
function SendBar({ totalCents }: { totalCents: number | null }) {
  return (
    <div className="glass-strong sticky bottom-0 z-20 -mx-4 -mb-4 flex items-center gap-3 rounded-t-none rounded-b-2xl border-x-0 border-b-0 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:-mb-6 sm:gap-4 sm:px-6 sm:pt-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-fg-subtle uppercase">Customer total</p>
        <p className="font-mono text-xl font-semibold text-fg tabular sm:text-2xl">
          {totalCents === null ? (
            <span className="font-sans text-sm font-medium text-warning-700">Check amounts</span>
          ) : (
            <CountUp value={totalCents} format="cents" duration={0.45} />
          )}
        </p>
      </div>
      <SubmitButton size="lg" leadingIcon={<Send />} pendingText="Sending…" className="shrink-0">
        Send quote
      </SubmitButton>
    </div>
  );
}
