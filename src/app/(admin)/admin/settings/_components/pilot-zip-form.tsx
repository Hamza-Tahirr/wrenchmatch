"use client";

import { MapPin, Plus, Radar } from "lucide-react";
import { useActionState, useEffect, useState, useTransition, type ChangeEvent, type FocusEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  CENTROID_CITY_MAX_LENGTH,
  INITIAL_ADMIN_ACTION_STATE,
  METRO_LABEL_MAX_LENGTH,
  type AdminActionState,
} from "@/lib/validation/admin";

import { previewPilotZip } from "../../_components/maps/coverage-console";
import { useAdminToast } from "../../_components/toast";
import { TAP_TARGET } from "../../_lib/ui";
import type { ZipLookup } from "../actions";

const LABELS = {
  zip: "ZIP code",
  metroLabel: "Metro area label",
  city: "City",
  state: "State",
  lat: "Latitude",
  lng: "Longitude",
  timeZone: "Time zone",
  enabled: "Enabled",
};

const TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

type PilotZipFormProps = {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  lookup: (zip: string) => Promise<ZipLookup>;
  /** Prefilled metro label: the label most pilot ZIPs use. */
  defaultMetroLabel: string;
};

function LookupMessage({ lookup }: { lookup: ZipLookup }) {
  if (lookup.status === "invalid") return null;
  if (lookup.status === "unknown") {
    return (
      <Alert tone="warning" title={`No location data on file for ${lookup.zip}`}>
        Enter its city, state, approximate latitude and longitude, and time zone below. The point appears on the map as you
        type.
      </Alert>
    );
  }
  const where = `${lookup.city}, ${lookup.state} (${lookup.timeZone})`;
  if (lookup.pilotEnabled !== null) {
    return (
      <Alert tone="info" title={`${lookup.zip} is already a pilot ZIP (${lookup.pilotEnabled ? "enabled" : "disabled"})`}>
        {where}. Saving updates its metro label and whether it is enabled.
        {lookup.editable ? " Its location was entered by an admin, so you can correct it below." : " Leave the location empty."}
      </Alert>
    );
  }
  return (
    <Alert tone="success" title={`Location on file for ${lookup.zip}: previewed on the map`}>
      {where}, source: {lookup.source}.{" "}
      {lookup.editable ? "You can correct it below or leave the location empty." : "Leave the location fields empty."}
    </Alert>
  );
}

function parseCoordinate(value: string, limit: number): number | null {
  const trimmed = value.trim();
  if (!/^-?\d{1,3}(\.\d+)?$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return Math.abs(number) <= limit ? number : null;
}

/** Adds a pilot ZIP (or updates one), asking for an approximate location only when none is on file. */
export function PilotZipForm({ action, lookup, defaultMetroLabel }: PilotZipFormProps) {
  const [result, setResult] = useState<ZipLookup | null>(null);
  const [checking, startChecking] = useTransition();
  const showToast = useAdminToast();
  const [state, dispatch] = useActionState<AdminActionState, FormData>(async (previous, formData) => {
    const next = await action(previous, formData);
    // The form stays on the page: the ZIP lookup and the map preview reset after a save.
    if (next.ok) {
      setResult(null);
      previewPilotZip(null);
      if (next.message) showToast(next.message);
    }
    return next;
  }, INITIAL_ADMIN_ACTION_STATE);

  // Leaving the page clears the preview point.
  useEffect(() => () => previewPilotZip(null), []);

  const failure = state.ok ? null : state;
  const errors = failure?.fieldErrors ?? {};
  const values = failure?.values ?? {};
  const locationLocked = result?.status === "known" && !result.editable;
  const repeated = Object.values(errors).flat().includes(failure?.formError ?? "");

  /** Previews the coordinates typed into the form (an unknown or admin-entered ZIP). */
  function previewTyped(form: HTMLFormElement | null, zip: string) {
    const field = (name: string) => {
      const element = form?.elements.namedItem(name);
      return element instanceof HTMLInputElement ? element.value : "";
    };
    const lat = parseCoordinate(field("lat"), 90);
    const lng = parseCoordinate(field("lng"), 180);
    if (lat === null || lng === null) {
      previewPilotZip(null);
      return;
    }
    previewPilotZip({ zip, lat, lng, label: field("city").trim() || "Typed coordinates" });
  }

  function checkZip(event: FocusEvent<HTMLInputElement>) {
    const zip = event.currentTarget.value.trim();
    const form = event.currentTarget.form;
    if (!/^\d{5}$/.test(zip)) {
      setResult(null);
      previewPilotZip(null);
      return;
    }
    startChecking(async () => {
      const found = await lookup(zip);
      setResult(found);
      if (found.status === "known") {
        previewPilotZip({ zip: found.zip, lat: found.lat, lng: found.lng, label: `${found.city}, ${found.state}` });
      } else if (found.status === "unknown") {
        previewTyped(form, found.zip);
      } else {
        previewPilotZip(null);
      }
    });
  }

  function onLocationInput(event: ChangeEvent<HTMLInputElement>) {
    const editable = result?.status === "unknown" || (result?.status === "known" && result.editable);
    if (result && result.status !== "invalid" && editable) previewTyped(event.currentTarget.form, result.zip);
  }

  return (
    // Container queries: the form sits beside the map on wide screens and full width on others.
    <form action={dispatch} noValidate className="@container space-y-5">
      <FormErrorSummary
        formError={repeated ? null : failure?.formError}
        fieldErrors={errors}
        labels={LABELS}
        focusKey={state}
      />
      {state.ok && state.message ? (
        <p className="flex animate-slide-up items-start gap-2 rounded-xl border border-success-300/50 bg-success-50/70 px-3 py-2 text-sm text-success-800">
          {state.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 @sm:grid-cols-[9rem_minmax(0,1fr)]">
        <Field label="ZIP code" name="zip" error={errors.zip} required hint="5 digits">
          <Input inputMode="numeric" autoComplete="off" maxLength={5} defaultValue={values.zip ?? ""} onBlur={checkZip} />
        </Field>
        <Field
          label="Metro area label"
          name="metroLabel"
          error={errors.metroLabel}
          required
          hint="Customers see it, e.g. Phoenix metro."
        >
          <Input maxLength={METRO_LABEL_MAX_LENGTH} defaultValue={values.metroLabel ?? defaultMetroLabel} />
        </Field>
      </div>

      <div aria-live="polite" className="space-y-2">
        {checking ? <Spinner label="Checking the ZIP code…" /> : null}
        {!checking && result ? <LookupMessage lookup={result} /> : null}
      </div>

      <fieldset className="space-y-4 rounded-2xl border border-line bg-fg/[0.02] p-4" disabled={locationLocked}>
        <legend className="px-1 text-sm font-semibold text-fg">
          <span className="inline-flex items-center gap-1.5 align-middle">
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-neon-cyan" />
            Approximate location
          </span>
        </legend>
        <p className="flex gap-2 text-sm text-fg-muted">
          <Radar aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neon-violet" />
          <span>
            <span className="font-medium text-fg">Only for a ZIP without location data.</span> Distances are measured from a
            ZIP-area center point, so these coordinates are approximate (for example the US Census gazetteer point). No paid
            geocoder is used. The point previews on the map before you save.
          </span>
        </p>
        <div className="grid grid-cols-1 gap-4 @xs:grid-cols-[minmax(0,1fr)_5.5rem]">
          <Field label="City" name="city" error={errors.city} hint="e.g. Flagstaff">
            <Input
              maxLength={CENTROID_CITY_MAX_LENGTH}
              defaultValue={values.city ?? ""}
              autoComplete="off"
              onChange={onLocationInput}
            />
          </Field>
          <Field label="State" name="state" error={errors.state} hint="e.g. AZ">
            <Input maxLength={2} defaultValue={values.state ?? ""} autoComplete="off" className="uppercase" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 @xs:grid-cols-2 @lg:grid-cols-3">
          <Field label="Latitude" name="lat" error={errors.lat} hint="e.g. 33.45">
            <Input inputMode="decimal" defaultValue={values.lat ?? ""} autoComplete="off" onChange={onLocationInput} />
          </Field>
          <Field label="Longitude" name="lng" error={errors.lng} hint="e.g. -112.07">
            <Input inputMode="decimal" defaultValue={values.lng ?? ""} autoComplete="off" onChange={onLocationInput} />
          </Field>
          <Field label="Time zone" name="timeZone" error={errors.timeZone} hint="IANA name">
            <Input list="pilot-zip-time-zones" defaultValue={values.timeZone ?? ""} autoComplete="off" />
          </Field>
        </div>
        <datalist id="pilot-zip-time-zones">
          {TIME_ZONES.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </fieldset>

      <Checkbox
        name="enabled"
        label="Enabled"
        hint="Customers in this ZIP can send requests right away."
        defaultChecked={failure?.values ? failure.values.enabled === "on" : true}
        error={errors.enabled}
      />
      {/* Phones: the save button stays at the bottom of the screen while the form is in view. */}
      <div className="flex justify-end max-sm:sticky max-sm:bottom-0 max-sm:z-20 max-sm:-mx-4 max-sm:border-t max-sm:border-line max-sm:bg-elevated/90 max-sm:px-4 max-sm:pt-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:backdrop-blur-md">
        <SubmitButton leadingIcon={<Plus />} pendingText="Saving pilot ZIP…" className={`max-sm:w-full ${TAP_TARGET}`}>
          Save pilot ZIP
        </SubmitButton>
      </div>
    </form>
  );
}
