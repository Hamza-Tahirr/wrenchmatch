"use client";

import { CalendarClock, Car, Lock, MapPin, Send, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { useState } from "react";

import { UploadBudgetGuard } from "@/components/media/upload-budget-guard";
import { CheckboxGroup } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import {
  REQUEST_FIELD_LABELS,
  REQUEST_REQUIRED_MESSAGES,
  US_STATE_CODES,
  type RequestFormValues,
  type RequestRequiredField,
} from "@/lib/validation/request";
import type { RequestFormOptions } from "@/server/catalog/request-form";
import type { FormFailure } from "@/server/customer/form-errors";
import type { RequestFormState } from "@/server/customer/request-form";

import { ConsentText } from "../../_components/consent-text";
import { InlineNote } from "../../_components/facts";
import { useVersionedActionState } from "../../_components/use-versioned-action-state";
import { formatCount } from "../../_lib/display";
import { submitRequestAction } from "../actions";
import { CategoryField } from "./category-field";
import { FormSection } from "./form-section";
import { PhotoPicker } from "./photo-picker";
import { RequestWizard, type WizardStepDef } from "./request-wizard";
import { SendOverlay } from "./send-overlay";
import { ZipField } from "./zip-field";

const STEPS: readonly WizardStepDef[] = [
  {
    id: "location",
    label: "Location",
    icon: <MapPin />,
    fields: ["zip", "streetAddress", "city", "state", "locationNotes"],
  },
  { id: "vehicle", label: "Vehicle", icon: <Car />, fields: ["vehicleYear", "vehicleMake", "vehicleModel", "mileage"] },
  { id: "problem", label: "Problem", icon: <Wrench />, fields: ["categoryId", "description", "drivable", "photos", "video"] },
  {
    id: "schedule",
    label: "When & where",
    icon: <CalendarClock />,
    fields: ["preferredDate", "preferredWindow", "serviceMode", "maxGarageDistanceMiles"],
  },
  { id: "contact", label: "Contact", icon: <ShieldCheck />, fields: ["contactPhone", "contactEmail", "acceptedConsentKeys"] },
];

/** Every consent must be ticked. */
const ALL_REQUIRED_CHECKBOXES = ["acceptedConsentKeys"] as const;

const DRIVABLE_OPTIONS = [
  { value: "yes", label: "Yes, it can be driven", hint: "You could take it to a garage if that suits you." },
  { value: "no", label: "No, it can't be driven", hint: "Mobile service, where the mechanic comes to you, usually works best." },
] as const;

export type RequestFormProps = {
  initialState: RequestFormState;
  options: RequestFormOptions;
};

/** The repair-request wizard. Every rule is checked again on the server when it is sent. */
export function RequestForm({ initialState, options }: RequestFormProps) {
  const [state, dispatch, version] = useVersionedActionState(submitRequestAction, initialState);
  const failure = state.ok ? null : state;

  return (
    <form
      action={dispatch}
      noValidate
      className="glass-strong relative rounded-3xl p-4 sm:p-8"
      aria-label="Repair request"
    >
      {/* Remounts after each refused submit, so every field shows the values that were sent. */}
      <RequestFormFields key={version} failure={failure} options={options} refused={version > 0} focusKey={version} />
      <SendOverlay />
    </form>
  );
}

function RequestFormFields({
  failure,
  options,
  refused,
  focusKey,
}: {
  failure: FormFailure<RequestFormValues> | null;
  options: RequestFormOptions;
  refused: boolean;
  focusKey: number;
}) {
  const values = failure?.values ?? {};
  const errors = failure?.fieldErrors ?? {};
  // Required fields "Next" found empty: their messages show right at the fields.
  const [missing, setMissing] = useState<readonly string[]>([]);
  const errorFor = (name: RequestRequiredField) =>
    errors[name] ?? (missing.includes(name) ? REQUEST_REQUIRED_MESSAGES[name] : undefined);
  const [serviceMode, setServiceMode] = useState(values.serviceMode ?? "");
  const [descriptionLength, setDescriptionLength] = useState(values.description?.length ?? 0);
  const years = Array.from(
    { length: options.vehicleYears.max - options.vehicleYears.min + 1 },
    (_, index) => String(options.vehicleYears.max - index),
  );
  const showGarageDistance = serviceMode === "garage" || serviceMode === "either";
  const { photos, video } = options.uploads;
  const descriptionShort = descriptionLength > 0 && descriptionLength < options.description.minLength;

  return (
    <RequestWizard
      steps={STEPS}
      errorNames={Object.keys(errors).filter((name) => (errors[name]?.length ?? 0) > 0)}
      refused={refused}
      allRequiredCheckboxes={ALL_REQUIRED_CHECKBOXES}
      labels={REQUEST_FIELD_LABELS}
      missing={missing}
      onMissingChange={setMissing}
      header={
        <FormErrorSummary
          title="Please fix the following before sending"
          formError={failure?.formError}
          fieldErrors={errors}
          labels={REQUEST_FIELD_LABELS}
          focusKey={focusKey}
        />
      }
      finish={
        <SubmitButton
          size="lg"
          leadingIcon={<Send />}
          pendingText="Sending your request…"
          fullWidth
          className="shadow-glow sm:w-auto sm:min-w-56"
        >
          Send request
        </SubmitButton>
      }
    >
      <FormSection
        id="location"
        icon={<MapPin />}
        title="Where is the car?"
        description="We use the ZIP code to find approved mechanics nearby. Only the approximate area is ever shown to them before a booking."
      >
        <ZipField
          defaultValue={values.zip ?? ""}
          error={errorFor("zip")}
          pilotAreas={options.pilotAreas}
          coverage={options.coverage}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Street address"
            name="streetAddress"
            optional
            error={errors.streetAddress}
            className="sm:col-span-2"
          >
            <Input autoComplete="street-address" maxLength={200} defaultValue={values.streetAddress} />
          </Field>
          <Field label="City" name="city" optional error={errors.city}>
            <Input autoComplete="address-level2" maxLength={80} defaultValue={values.city} />
          </Field>
          <Field label="State" name="state" optional error={errors.state}>
            <Select placeholder="Choose a state" autoComplete="address-level1" defaultValue={values.state?.toUpperCase() ?? ""}>
              {US_STATE_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Location notes"
            name="locationNotes"
            optional
            hint="Parking, gate codes, or where to find the car."
            error={errors.locationNotes}
            className="sm:col-span-2"
          >
            <Textarea rows={2} maxLength={300} defaultValue={values.locationNotes} />
          </Field>
        </div>
        <InlineNote icon={<Lock />}>
          Your street address and notes stay private until a booking is confirmed. Before that, mechanics only see
          the approximate area, such as &ldquo;Tempe, AZ 85281&rdquo;.
        </InlineNote>
      </FormSection>

      <FormSection
        id="vehicle"
        icon={<Car />}
        title="Which vehicle?"
        description="Mechanics are matched by the makes they work on."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Year" name="vehicleYear" required error={errorFor("vehicleYear")}>
            <Select placeholder="Choose a year" defaultValue={values.vehicleYear ?? ""}>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Make" name="vehicleMake" required error={errorFor("vehicleMake")}>
            <Select placeholder="Choose a make" defaultValue={values.vehicleMake ?? ""}>
              {options.makes.map((make) => (
                <option key={make} value={make}>
                  {make}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Model" name="vehicleModel" required hint="For example Civic, Camry or F-150." error={errorFor("vehicleModel")}>
            <Input maxLength={60} autoComplete="off" defaultValue={values.vehicleModel} />
          </Field>
          <Field label="Mileage" name="mileage" required hint="An estimate is fine, like 98,000." error={errorFor("mileage")}>
            <Input inputMode="numeric" autoComplete="off" maxLength={12} trailingText="miles" defaultValue={values.mileage} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        id="problem"
        icon={<Wrench />}
        title="What's going on?"
        description="The more mechanics know, the more accurate their quotes."
      >
        <CategoryField categories={options.categories} defaultValue={values.categoryId ?? ""} error={errorFor("categoryId")} />
        <div className="space-y-1.5">
          <Field
            label="Describe the problem"
            name="description"
            required
            hint="What happens, and when? Any noises, smells or warning lights? Anything you've already tried?"
            error={errorFor("description")}
          >
            <Textarea
              rows={5}
              maxLength={options.description.maxLength}
              defaultValue={values.description}
              onChange={(event) => setDescriptionLength(event.currentTarget.value.length)}
            />
          </Field>
          <p className={cn("text-right font-mono text-xs tabular-nums", descriptionShort ? "text-warning-800" : "text-fg-subtle")}>
            {formatCount(descriptionLength)} / {formatCount(options.description.maxLength)}
            {descriptionShort ? ` · at least ${options.description.minLength}` : null}
          </p>
        </div>
        <RadioGroup
          name="drivable"
          legend="Can the car be driven?"
          variant="cards"
          columns={2}
          required
          defaultValue={values.drivable}
          error={errorFor("drivable")}
          options={DRIVABLE_OPTIONS}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="Photos" name={photos.field} optional hint={photos.sharing} error={errors[photos.field]}>
            <PhotoPicker
              kind="photos"
              accept={photos.accept}
              acceptLabel={photos.acceptLabel}
              limitLabel={photos.limitLabel}
              maxFiles={photos.maxFiles}
              maxFileSizeBytes={photos.maxFileSizeBytes}
              budget={photos.budget}
            />
          </Field>
          <Field label="Short video" name={video.field} optional hint={video.sharing} error={errors[video.field]}>
            <PhotoPicker
              kind="video"
              accept={video.accept}
              acceptLabel={video.acceptLabel}
              limitLabel={video.limitLabel}
              maxFiles={video.maxFiles}
              maxFileSizeBytes={video.maxFileSizeBytes}
              budget={video.budget}
            />
          </Field>
        </div>
        <UploadBudgetGuard
          budget={photos.budget}
          advice="Remove a photo or choose a shorter video."
          reviewField={{ name: photos.field, label: "Review photos and video" }}
        />
      </FormSection>

      <FormSection
        id="schedule"
        icon={<CalendarClock />}
        title="When and where?"
        description="Mechanics propose an exact time in their quotes, based on these preferences."
      >
        <Field
          label="Preferred date"
          name="preferredDate"
          required
          hint="Today or within the next 60 days."
          error={errorFor("preferredDate")}
        >
          <Input
            type="date"
            min={options.preferredDate.min}
            max={options.preferredDate.max}
            defaultValue={values.preferredDate}
            className="sm:max-w-60"
          />
        </Field>
        <RadioGroup
          name="preferredWindow"
          legend="Preferred time of day"
          variant="cards"
          columns={2}
          required
          defaultValue={values.preferredWindow}
          error={errorFor("preferredWindow")}
          options={options.windows.map((window) => ({ value: window.value, label: window.label, hint: window.hours }))}
        />
        <RadioGroup
          name="serviceMode"
          legend="Where should the work happen?"
          variant="cards"
          columns={3}
          required
          defaultValue={values.serviceMode}
          onValueChange={setServiceMode}
          error={errorFor("serviceMode")}
          options={options.serviceModes.map((mode) => ({ value: mode.value, label: mode.label, hint: mode.description }))}
        />
        {showGarageDistance ? (
          <div className="animate-slide-down">
            <Field
              label="How far will you drive to a garage?"
              name="maxGarageDistanceMiles"
              hint="Distances are approximate: they're measured between ZIP code areas."
              error={errors.maxGarageDistanceMiles}
            >
              <Select
                defaultValue={values.maxGarageDistanceMiles ?? String(options.garageDistances.defaultMiles)}
                className="sm:max-w-60"
              >
                {options.garageDistances.options.map((miles) => (
                  <option key={miles} value={String(miles)}>
                    Up to {miles} miles
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </FormSection>

      <FormSection
        id="contact"
        icon={<ShieldCheck />}
        title="How can your mechanic reach you?"
        description="Shared only with the mechanic you book, and only once the booking is confirmed."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Phone"
            name="contactPhone"
            required
            hint="A 10-digit US number for this repair."
            error={errorFor("contactPhone")}
          >
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={25}
              placeholder="602-555-0142"
              defaultValue={values.contactPhone}
            />
          </Field>
          <Field
            label="Email"
            name="contactEmail"
            required
            hint="Updates about this repair go here. Change it if you like."
            error={errorFor("contactEmail")}
          >
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder="name@example.com"
              defaultValue={values.contactEmail}
            />
          </Field>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2/60 p-4 sm:p-5">
          <CheckboxGroup
            name="acceptedConsentKeys"
            legend="Before you send"
            hint={`Please read and tick all three. We keep a record of the exact wording (version ${options.consents.version}).`}
            required
            options={options.consents.items.map((item) => ({ value: item.key, label: <ConsentText text={item.text} /> }))}
            defaultValues={values.acceptedConsentKeys ?? []}
            error={errorFor("acceptedConsentKeys")}
          />
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-brand-300/40 bg-linear-to-r from-brand-50 to-surface-2/40 p-4">
          <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-neon-cyan" />
          <p className="text-sm text-pretty text-fg-muted">
            <strong className="font-semibold text-fg">Sending a request is free and doesn&rsquo;t book anything.</strong>{" "}
            You&rsquo;ll compare itemized quotes before choosing one, and online payments are coming soon, so
            you won&rsquo;t be charged.
          </p>
        </div>
      </FormSection>
    </RequestWizard>
  );
}
