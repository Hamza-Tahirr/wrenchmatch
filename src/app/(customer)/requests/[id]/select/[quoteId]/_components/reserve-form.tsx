"use client";

import { ArrowLeft, CalendarCheck, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button-link";
import { CheckboxGroup } from "@/components/ui/checkbox";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionStateToast } from "@/components/ui/toast";
import type { ConsentItem } from "@/lib/domain";

import { useVersionedActionState } from "../../../../../_components/use-versioned-action-state";
import { reserveQuoteAction } from "../actions";
import { INITIAL_RESERVE_STATE } from "../reserve-form-state";

const REFUSAL_TITLES: Readonly<Record<string, string>> = {
  quote_expired: "This quote has expired",
  mechanic_not_eligible: "This mechanic can't take the booking right now",
  conflict: "This quote can't be reserved",
  not_found: "We couldn't find this quote",
  rate_limited: "Please wait a moment",
};

export type ReserveFormProps = {
  quoteId: string;
  /** The request page, to go back and choose another quote. */
  backHref: string;
  consents: { version: string; items: readonly ConsentItem[] };
  /** "Reserve Marco R.'s quote" */
  submitLabel: string;
};

/** The booking consents and the Reserve button. The server sets the price; nothing is charged. */
export function ReserveForm({ quoteId, backHref, consents, submitLabel }: ReserveFormProps) {
  const [state, dispatch, version] = useVersionedActionState(reserveQuoteAction, INITIAL_RESERVE_STATE);
  const refused = state.formError !== null && state.code !== "invalid_input";
  // Success redirects to the reservation; refusals are shown inline and confirmed by a toast.
  const toastState = useMemo(
    () => (state.formError ? { ok: false, formError: REFUSAL_TITLES[state.code ?? ""] ?? "We couldn't reserve this quote" } : null),
    [state],
  );
  useActionStateToast(toastState);

  return (
    <form key={version} action={dispatch} noValidate className="space-y-5">
      <input type="hidden" name="quoteId" value={quoteId} />
      <FormErrorSummary
        title="Please confirm before reserving"
        fieldErrors={state.fieldErrors}
        labels={{ acceptedConsentKeys: "Agreements" }}
        focusKey={version}
      />
      {state.formError ? (
        <Alert
          tone="danger"
          title={REFUSAL_TITLES[state.code ?? ""] ?? "We couldn't reserve this quote"}
          actions={
            refused ? (
              <ButtonLink href={backHref} variant="secondary" size="sm" leadingIcon={<ArrowLeft />}>
                Back to your quotes
              </ButtonLink>
            ) : null
          }
        >
          <p>{state.formError}</p>
        </Alert>
      ) : null}

      <div className="rounded-2xl border border-line bg-surface-2/50 p-4 sm:p-5">
        <CheckboxGroup
          name="acceptedConsentKeys"
          legend="Before you reserve"
          hint={`Tick all three. We keep a timestamped record of the exact wording (version ${consents.version}).`}
          required
          options={consents.items.map((item) => ({ value: item.key, label: item.text }))}
          defaultValues={state.acceptedConsentKeys}
          error={state.fieldErrors.acceptedConsentKeys}
        />
      </div>

      <p className="flex items-start gap-2.5 rounded-2xl border border-neon-cyan/20 bg-neon-cyan/[0.06] p-4 text-sm text-pretty text-fg-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neon-cyan" />
        <span>
          This creates a <strong className="font-semibold text-fg">pending reservation, not a confirmed booking</strong>.
          Online payments are coming soon, so no card details are collected and you won&rsquo;t be charged. The mechanic
          is told about your reservation; contact details stay hidden on both sides until a booking is confirmed.
        </span>
      </p>

      <SubmitButton size="lg" fullWidth leadingIcon={<CalendarCheck />} pendingText="Reserving…" className="shadow-glow">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
