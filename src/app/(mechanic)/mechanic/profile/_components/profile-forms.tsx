"use client";

import { Save } from "lucide-react";
import { startTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type {
  MechanicAvailabilityFormValues,
  MechanicFormState,
  MechanicProfileFormValues,
  MechanicServicesFormValues,
} from "@/lib/validation/mechanic";
import type { MechanicFormOptions } from "@/server/mechanic/form-options";

import { availabilityFieldLabels, AvailabilityEditor } from "../../_components/availability-editor";
import { AboutYouFields, InsuranceFields, PROFILE_FIELD_LABELS, ServiceAreaFields } from "../../_components/profile-fields";
import { SERVICES_FIELD_LABELS, ServicesFields } from "../../_components/services-fields";
import { BAR_CLEARANCE, TAP } from "../../_components/tap";
import { useVersionedActionState } from "../../_components/use-versioned-action-state";
import { updateAvailabilityAction, updateProfileAction, updateServicesAction } from "../actions";
import { useEditableSection } from "./editable-section";

// The profile edit forms. Each lives inside an EditableSection and closes it after a
// successful save; a refused save keeps the form open with the typed values and errors.

/**
 * useVersionedActionState that closes the surrounding EditableSection on success (which
 * confirms with a toast); a refused save keeps the form open and flags it with a toast too.
 */
function useSectionForm<V>(
  action: (state: MechanicFormState<V>, formData: FormData) => Promise<MechanicFormState<V>>,
  failureTitle: string,
) {
  const section = useEditableSection();
  return useVersionedActionState<MechanicFormState<V>>(async (previous, formData) => {
    const result = await action(previous, formData);
    // In a transition, so the summary appears in the same commit as the refreshed profile data.
    if (result.ok) startTransition(() => section?.close(result.message));
    else toast.error(failureTitle, { description: "Check the highlighted fields." });
    return result;
  }, { ok: false });
}

/**
 * Cancel and Save, in a bar that sticks to the bottom of the screen while the form is in view
 * (the profile forms are long on a phone) and rests at the end of the section.
 */
export function FormActions({ label, pendingText, icon = <Save /> }: { label: string; pendingText: string; icon?: ReactNode }) {
  const section = useEditableSection();
  return (
    <div className="glass-strong sticky bottom-0 z-20 -mx-4 -mb-5 flex items-center justify-end gap-2 rounded-t-none rounded-b-2xl border-x-0 border-b-0 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
      <Button variant="ghost" onClick={() => section?.close()} className={TAP}>
        Cancel
      </Button>
      <SubmitButton leadingIcon={icon} pendingText={pendingText} className={TAP}>
        {label}
      </SubmitButton>
    </div>
  );
}

function FieldsetBlock({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <fieldset id={id} className="space-y-5">
      <legend className="mb-4 font-mono text-xs font-semibold tracking-[0.16em] text-neon-cyan uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ProfileDetailsForm({
  initialValues,
  options,
  minInsuranceExpiry,
  insuranceLocked = false,
}: {
  initialValues: MechanicProfileFormValues;
  options: MechanicFormOptions;
  minInsuranceExpiry: string;
  /** True once an admin has reviewed the application (insurance changes go through documents). */
  insuranceLocked?: boolean;
}) {
  const [state, dispatch, version] = useSectionForm(updateProfileAction, "Your profile wasn't saved");
  const values = !state.ok && state.values ? state.values : initialValues;
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  return (
    <form key={version} action={dispatch} noValidate className={cn("space-y-8", BAR_CLEARANCE)}>
      <FormErrorSummary
        title="Your profile wasn't saved"
        formError={state.ok ? null : state.formError}
        fieldErrors={errors}
        labels={PROFILE_FIELD_LABELS}
        focusKey={version}
      />
      <FieldsetBlock title="About you">
        <AboutYouFields values={values} errors={errors} options={options} />
      </FieldsetBlock>
      <FieldsetBlock title="Where you work">
        <ServiceAreaFields values={values} errors={errors} options={options} />
      </FieldsetBlock>
      <FieldsetBlock title="Insurance">
        <InsuranceFields
          values={values}
          errors={errors}
          options={options}
          minExpiry={minInsuranceExpiry}
          locked={insuranceLocked}
        />
      </FieldsetBlock>
      <FormActions label="Save profile" pendingText="Saving profile…" />
    </form>
  );
}

export function ServicesForm({
  initialValues,
  options,
  extraCategories,
}: {
  initialValues: MechanicServicesFormValues;
  options: MechanicFormOptions;
  extraCategories: ReadonlyArray<{ id: string; name: string }>;
}) {
  const [state, dispatch, version] = useSectionForm(updateServicesAction, "Your services weren't saved");
  const values = !state.ok && state.values ? state.values : initialValues;
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  return (
    <form key={version} action={dispatch} noValidate className={cn("space-y-8", BAR_CLEARANCE)}>
      <FormErrorSummary
        title="Your services weren't saved"
        formError={state.ok ? null : state.formError}
        fieldErrors={errors}
        labels={SERVICES_FIELD_LABELS}
        focusKey={version}
      />
      <ServicesFields values={values} errors={errors} options={options} extraCategories={extraCategories} />
      <FormActions label="Save services" pendingText="Saving services…" />
    </form>
  );
}

export function AvailabilityForm({ initialValues }: { initialValues: MechanicAvailabilityFormValues }) {
  const [state, dispatch, version] = useSectionForm(updateAvailabilityAction, "Your availability wasn't saved");
  const values = !state.ok && state.values ? state.values : initialValues;
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  return (
    <form key={version} action={dispatch} noValidate className={cn("space-y-6", BAR_CLEARANCE)}>
      <FormErrorSummary
        title="Your availability wasn't saved"
        formError={state.ok ? null : state.formError}
        fieldErrors={errors}
        labels={availabilityFieldLabels(values.availability)}
        focusKey={version}
      />
      <AvailabilityEditor
        rows={values.availability}
        errors={errors}
        hint="Customers' preferred times are matched against these hours, in your base area's local time."
      />
      <FormActions label="Save availability" pendingText="Saving availability…" />
    </form>
  );
}
