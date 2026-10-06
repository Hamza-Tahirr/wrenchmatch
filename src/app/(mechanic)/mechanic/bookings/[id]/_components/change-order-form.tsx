"use client";

import { Send } from "lucide-react";
import { startTransition, useState } from "react";

import { Callout } from "@/components/ui/alert";
import { DialogClose, useDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { parseDollarsToCents } from "@/lib/validation/mechanic";
import { CHANGE_ORDER_LIMITS, type ChangeOrderFormValues } from "@/lib/validation/quote";

import { CountUp } from "../../../_components/count-up";
import { BAR_CLEARANCE, TAP } from "../../../_components/tap";
import { useVersionedActionState } from "../../../_components/use-versioned-action-state";
import { proposeChangeOrderAction, type ChangeOrderFormState } from "../actions";

const LABELS: Readonly<Record<string, string>> = {
  description: "Extra work",
  reason: "Why it's needed",
  laborPrice: "Extra labor",
  partsPrice: "Extra parts",
  taxAmount: "Extra tax",
};

const EMPTY: ChangeOrderFormValues = { description: "", reason: "", laborPrice: "", partsPrice: "", taxAmount: "" };

/** Proposes extra work on a confirmed or in-progress booking; closes its dialog when sent. */
export function ChangeOrderForm({ bookingId }: { bookingId: string }) {
  const dialog = useDialog();
  const [state, dispatch, version] = useVersionedActionState<ChangeOrderFormState>(async (previous, formData) => {
    const result = await proposeChangeOrderAction(previous, formData);
    // In a transition, so the dialog closes in the same commit as the refreshed booking.
    if (result.ok) {
      toast.success("Change order sent", { description: "The customer approves or declines it before you do the work." });
      startTransition(() => dialog?.close());
    } else {
      toast.error("The change order wasn't sent", { description: "Check the highlighted fields." });
    }
    return result;
  }, { ok: false });
  const values = !state.ok && state.values ? state.values : EMPTY;
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  return (
    <form key={version} action={dispatch} noValidate className={`space-y-5 ${BAR_CLEARANCE}`}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <FormErrorSummary
        title="The change order wasn't sent"
        formError={state.ok ? null : state.formError}
        fieldErrors={errors}
        labels={LABELS}
        focusKey={version}
      />
      <ChangeOrderFields values={values} errors={errors} />
      {/* Stays at the bottom of the dialog (a tall sheet on phones) while the fields scroll. */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-line bg-elevated/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end">
        <DialogClose className={TAP}>Cancel</DialogClose>
        <SubmitButton leadingIcon={<Send />} pendingText="Sending…" className={TAP}>
          Send for approval
        </SubmitButton>
      </div>
    </form>
  );
}

function amount(raw: string): number | null {
  return raw.trim() === "" ? 0 : parseDollarsToCents(raw);
}

function ChangeOrderFields({ values, errors }: { values: ChangeOrderFormValues; errors: Record<string, string[]> }) {
  const [labor, setLabor] = useState(values.laborPrice);
  const [parts, setParts] = useState(values.partsPrice);
  const [tax, setTax] = useState(values.taxAmount);
  const amounts = [amount(labor), amount(parts), amount(tax)];
  const total = amounts.some((value) => value === null)
    ? null
    : amounts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return (
    <>
      <Field label="Extra work" hint="What you propose to do in addition to the agreed scope." error={errors.description} required>
        <Textarea
          name="description"
          rows={3}
          maxLength={CHANGE_ORDER_LIMITS.descriptionMax}
          defaultValue={values.description}
          data-autofocus
        />
      </Field>
      <Field label="Why it's needed" hint="What you found, in words the customer can follow." error={errors.reason} required>
        <Textarea name="reason" rows={3} maxLength={CHANGE_ORDER_LIMITS.reasonMax} defaultValue={values.reason} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Extra labor (USD)" error={errors.laborPrice}>
          <Input
            name="laborPrice"
            inputMode="decimal"
            leadingText="$"
            placeholder="0.00"
            value={labor}
            onChange={(event) => setLabor(event.currentTarget.value)}
          />
        </Field>
        <Field label="Extra parts (USD)" error={errors.partsPrice}>
          <Input
            name="partsPrice"
            inputMode="decimal"
            leadingText="$"
            placeholder="0.00"
            value={parts}
            onChange={(event) => setParts(event.currentTarget.value)}
          />
        </Field>
        <Field label="Extra tax (USD)" error={errors.taxAmount}>
          <Input
            name="taxAmount"
            inputMode="decimal"
            leadingText="$"
            placeholder="0.00"
            value={tax}
            onChange={(event) => setTax(event.currentTarget.value)}
          />
        </Field>
      </div>
      <p className="flex items-center justify-between rounded-xl border border-neon-cyan/30 bg-neon-cyan/5 px-4 py-3 text-sm shadow-glow-sm">
        <span className="font-mono text-xs font-semibold tracking-[0.14em] text-neon-cyan uppercase">Extra amount (preview)</span>
        <span className="font-mono text-lg font-semibold text-fg tabular">
          {total === null ? <span className="font-sans text-sm text-warning-700">Check amounts</span> : <CountUp value={total} format="cents" duration={0.45} />}
        </span>
      </p>
      <Callout tone="info" title="The customer approves first">
        <p>
          Don&rsquo;t start the extra work until the customer approves it. Nothing is charged online for change orders:
          online payments are coming soon.
        </p>
      </Callout>
    </>
  );
}
