"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useActionStateToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  SUPPORT_FIELD_LABELS,
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_MESSAGE_MIN_LENGTH,
  SUPPORT_TOPIC_INFO,
  SUPPORT_TOPICS,
} from "@/lib/validation/support";
import type { SupportLinkOptions } from "@/server/support/requests";

import { useVersionedActionState } from "../../(customer)/_components/use-versioned-action-state";
import { createSupportRequestAction } from "../actions";
import { initialSupportFormState, type SupportFormState, type SupportFormValues } from "../support-form-state";

export type SupportFormProps = {
  linkOptions: SupportLinkOptions;
  /** Prefilled from ?requestId / ?bookingId when they are the viewer's own records. */
  defaults: SupportFormValues;
  /** "request" for customers ("your requests"), "job" for mechanics. */
  requestNoun: "request" | "job";
};

/** The help-request form: topic, message and an optional request or booking it is about. */
export function SupportForm({ linkOptions, defaults, requestNoun }: SupportFormProps) {
  const [state, dispatch, version] = useVersionedActionState<SupportFormState>(
    createSupportRequestAction,
    initialSupportFormState(defaults),
  );
  useActionStateToast(state, { success: "Help request sent", error: "Your help request wasn't sent" });

  return (
    <form action={dispatch} noValidate className="space-y-6">
      {state.ok ? (
        <Alert tone="success" title="We received your help request">
          <p>Our team will review it and reply on this page. You&rsquo;ll also get a notification when they do.</p>
        </Alert>
      ) : null}
      <SupportFormFields key={version} state={state} linkOptions={linkOptions} requestNoun={requestNoun} focusKey={version} />
    </form>
  );
}

function SupportFormFields({
  state,
  linkOptions,
  requestNoun,
  focusKey,
}: {
  state: SupportFormState;
  linkOptions: SupportLinkOptions;
  requestNoun: "request" | "job";
  focusKey: number;
}) {
  const values = state.values;
  const errors = state.fieldErrors;
  const [length, setLength] = useState(values.message?.length ?? 0);
  const tooShort = length > 0 && length < SUPPORT_MESSAGE_MIN_LENGTH;

  return (
    <>
      <FormErrorSummary
        title="Your help request wasn't sent"
        formError={state.formError}
        fieldErrors={errors}
        labels={SUPPORT_FIELD_LABELS}
        focusKey={focusKey}
      />
      <RadioGroup
        name="topic"
        legend="What do you need help with?"
        variant="cards"
        columns={2}
        required
        defaultValue={values.topic}
        error={errors.topic}
        options={SUPPORT_TOPICS.map((topic) => ({
          value: topic,
          label: SUPPORT_TOPIC_INFO[topic].label,
          hint: SUPPORT_TOPIC_INFO[topic].description,
        }))}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={requestNoun === "request" ? "Related request" : "Related job"}
          name="requestId"
          optional
          error={errors.requestId}
        >
          <Select placeholder={requestNoun === "request" ? "Not about a specific request" : "Not about a specific job"} defaultValue={values.requestId ?? ""}>
            {linkOptions.requests.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Related booking" name="bookingId" optional error={errors.bookingId}>
          <Select placeholder="Not about a specific booking" defaultValue={values.bookingId ?? ""}>
            {linkOptions.bookings.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="space-y-1.5">
        <Field
          label="Message"
          name="message"
          required
          hint="What happened, and what would you like us to do? Please don't include card numbers or passwords."
          error={errors.message}
        >
          <Textarea
            rows={6}
            maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
            defaultValue={values.message}
            onChange={(event) => setLength(event.currentTarget.value.length)}
          />
        </Field>
        <p className={cn("text-right font-mono text-xs tabular-nums", tooShort ? "text-warning-800" : "text-fg-subtle")}>
          {length.toLocaleString("en-US")} / {SUPPORT_MESSAGE_MAX_LENGTH.toLocaleString("en-US")}
          {tooShort ? ` · at least ${SUPPORT_MESSAGE_MIN_LENGTH}` : null}
        </p>
      </div>
      <SubmitButton size="lg" fullWidth leadingIcon={<Send />} pendingText="Sending…" className="shadow-glow-sm sm:w-auto">
        Send to the help desk
      </SubmitButton>
    </>
  );
}
