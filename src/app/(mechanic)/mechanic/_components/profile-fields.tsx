"use client";

import { useState } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { MechanicServiceMode } from "@/lib/domain";
import type { FieldErrors, MechanicProfileFormValues } from "@/lib/validation/mechanic";
import type { MechanicFormOptions } from "@/server/mechanic/form-options";

import { ServiceAreaMap } from "./service-area-map";

// Field groups of the mechanic profile, shared by the application form and the profile
// edit form. Input names match MechanicProfileFormValues, so server field errors land on
// the right control and FormErrorSummary links to them.

type GroupProps = {
  values: MechanicProfileFormValues;
  errors: FieldErrors;
  options: Pick<MechanicFormOptions, "limits" | "serviceModes" | "zipSuggestions" | "zipCentroids">;
};

/** Labels for FormErrorSummary, keyed by input name. */
export const PROFILE_FIELD_LABELS: Readonly<Record<string, string>> = {
  displayName: "Public display name",
  legalName: "Legal name",
  businessName: "Business name",
  phone: "Phone",
  contactEmail: "Contact email",
  bio: "Short bio",
  yearsExperience: "Years of experience",
  certifications: "Certifications",
  baseZip: "Base ZIP code",
  serviceMode: "How you work",
  travelRadiusMiles: "Travel radius",
  garageAddressLine1: "Garage street address",
  garageCity: "Garage city",
  garageState: "Garage state",
  garageZip: "Garage ZIP code",
  insuranceProvider: "Insurance provider",
  insurancePolicyNumber: "Policy number",
  insuranceExpiresOn: "Insurance expiry date",
};

const PRIVATE_HINT = "Private: shared with a customer only after a confirmed booking.";

export function AboutYouFields({ values, errors, options }: GroupProps) {
  const { limits } = options;
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
      <Field
        label="Public display name"
        hint='Customers see this name, like "Marco R." or your shop name.'
        error={errors.displayName}
        required
        className="sm:col-span-2"
      >
        <Input
          name="displayName"
          defaultValue={values.displayName}
          maxLength={limits.displayNameMax}
          autoComplete="nickname"
        />
      </Field>
      <Field label="Legal name" hint="Private. Used by admins to verify your ID." error={errors.legalName} required>
        <Input name="legalName" defaultValue={values.legalName} maxLength={limits.legalNameMax} autoComplete="name" />
      </Field>
      <Field label="Business name" hint="Private, if you work as a business." error={errors.businessName} optional>
        <Input
          name="businessName"
          defaultValue={values.businessName}
          maxLength={limits.businessNameMax}
          autoComplete="organization"
        />
      </Field>
      <Field label="Phone" hint={PRIVATE_HINT} error={errors.phone} required>
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={values.phone}
          maxLength={limits.phoneMax}
          autoComplete="tel"
          placeholder="602-555-0142"
        />
      </Field>
      <Field label="Contact email" hint={PRIVATE_HINT} error={errors.contactEmail} required>
        <Input
          name="contactEmail"
          type="email"
          inputMode="email"
          defaultValue={values.contactEmail}
          maxLength={limits.emailMax}
          autoComplete="email"
        />
      </Field>
      <Field label="Years of experience" hint="Whole years; 0 is fine." error={errors.yearsExperience} required>
        <Input
          name="yearsExperience"
          type="number"
          inputMode="numeric"
          min={0}
          max={limits.yearsExperienceMax}
          defaultValue={values.yearsExperience}
          trailingText="years"
        />
      </Field>
      <Field
        label="Certifications"
        hint="For example ASE A5 Brakes. Upload certificates in the documents step."
        error={errors.certifications}
        optional
      >
        <Input name="certifications" defaultValue={values.certifications} maxLength={limits.certificationsMax} />
      </Field>
      <Field
        label="Short bio"
        hint="Shown to customers you quote. What you specialize in, how you work."
        error={errors.bio}
        optional
        className="sm:col-span-2"
      >
        <Textarea name="bio" rows={3} defaultValue={values.bio} maxLength={limits.bioMax} />
      </Field>
    </div>
  );
}

function isMechanicServiceMode(value: string): value is MechanicServiceMode {
  return value === "mobile" || value === "garage" || value === "both";
}

export function ServiceAreaFields({ values, errors, options }: GroupProps) {
  const { limits } = options;
  const [mode, setMode] = useState<MechanicServiceMode | "">(
    isMechanicServiceMode(values.serviceMode) ? values.serviceMode : "",
  );
  // The inputs stay uncontrolled (React resets them after a submit); the map follows them.
  const [zip, setZip] = useState(values.baseZip);
  const [radius, setRadius] = useState(values.travelRadiusMiles);
  const needsGarage = mode === "garage" || mode === "both";
  const zipListId = "mechanic-zip-suggestions";
  return (
    <div className="space-y-6">
      <RadioGroup
        name="serviceMode"
        legend="How you work"
        variant="cards"
        columns={3}
        required
        defaultValue={values.serviceMode}
        onValueChange={(value) => setMode(isMechanicServiceMode(value) ? value : "")}
        error={errors.serviceMode}
        options={options.serviceModes.map((option) => ({
          value: option.value,
          label: option.label,
          hint: option.description,
        }))}
      />
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field
          label="Base ZIP code"
          hint="Distances to jobs are measured from this ZIP's center (approximate)."
          error={errors.baseZip}
          required
        >
          <Input
            name="baseZip"
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            list={options.zipSuggestions.length > 0 ? zipListId : undefined}
            defaultValue={values.baseZip}
            placeholder="85004"
            onChange={(event) => setZip(event.currentTarget.value)}
          />
        </Field>
        <Field
          label="Travel radius for mobile jobs"
          hint={mode === "garage" ? "Used only if you add mobile service later." : "How far you drive to customers, 1 to 100 miles."}
          error={errors.travelRadiusMiles}
          required
        >
          <Input
            name="travelRadiusMiles"
            type="number"
            inputMode="numeric"
            min={limits.travelRadiusMin}
            max={limits.travelRadiusMax}
            defaultValue={values.travelRadiusMiles}
            trailingText="miles"
            onChange={(event) => setRadius(event.currentTarget.value)}
          />
        </Field>
      </div>
      <ServiceAreaMap
        zip={zip}
        radius={radius}
        mode={mode}
        centroids={options.zipCentroids}
        pilotZips={options.zipSuggestions.map((suggestion) => suggestion.zip)}
      />
      {options.zipSuggestions.length > 0 ? (
        <datalist id={zipListId}>
          {options.zipSuggestions.map((suggestion) => (
            <option key={suggestion.zip} value={suggestion.zip}>
              {suggestion.label}
            </option>
          ))}
        </datalist>
      ) : null}
      {needsGarage ? (
        <fieldset className="space-y-4 rounded-xl border border-line bg-surface-2/50 p-4 sm:p-5">
          <legend className="px-1 text-sm font-semibold text-fg">Garage address</legend>
          <p className="text-sm text-fg-muted">
            Private. Customers see only your approximate area until a booking is confirmed.
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-6">
            <Field
              label="Street address"
              error={errors.garageAddressLine1}
              required
              className="sm:col-span-6"
            >
              <Input
                name="garageAddressLine1"
                defaultValue={values.garageAddressLine1}
                maxLength={limits.garageLine1Max}
                autoComplete="address-line1"
              />
            </Field>
            <Field label="City" error={errors.garageCity} required className="sm:col-span-3">
              <Input
                name="garageCity"
                defaultValue={values.garageCity}
                maxLength={limits.garageCityMax}
                autoComplete="address-level2"
              />
            </Field>
            <Field label="State" hint="2 letters" error={errors.garageState} required className="sm:col-span-1">
              <Input
                name="garageState"
                defaultValue={values.garageState}
                maxLength={2}
                autoComplete="address-level1"
                className="uppercase"
              />
            </Field>
            <Field label="ZIP code" error={errors.garageZip} required className="sm:col-span-2">
              <Input
                name="garageZip"
                inputMode="numeric"
                maxLength={5}
                defaultValue={values.garageZip}
                autoComplete="postal-code"
              />
            </Field>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

export function InsuranceFields({
  values,
  errors,
  options,
  minExpiry,
  locked = false,
}: GroupProps & {
  minExpiry: string;
  /** After admin review the insurance on file changes only through a verified certificate. */
  locked?: boolean;
}) {
  const { limits } = options;
  const lockedHint = "Verified by an admin. Upload a new certificate under Documents to update it.";
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
      {locked ? (
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg-muted sm:col-span-2">
          Your insurance details are checked by our team. To renew or change them, upload your new insurance
          certificate with its expiry date under <a href="#documents" className="font-semibold text-neon-cyan underline-offset-4 hover:underline">Documents</a>.
          An admin verifies it and your profile updates automatically.
        </p>
      ) : null}
      <Field
        label="Insurance provider"
        hint={locked ? lockedHint : "Your liability insurance company."}
        error={errors.insuranceProvider}
        required
      >
        <Input
          name="insuranceProvider"
          defaultValue={values.insuranceProvider}
          maxLength={limits.insuranceProviderMax}
          autoComplete="off"
          readOnly={locked}
        />
      </Field>
      <Field
        label="Policy number"
        hint={locked ? "Private. Seen by admins only. Verified by an admin." : "Private. Seen by admins only."}
        error={errors.insurancePolicyNumber}
        required
      >
        <Input
          name="insurancePolicyNumber"
          defaultValue={values.insurancePolicyNumber}
          maxLength={limits.policyNumberMax}
          autoComplete="off"
          readOnly={locked}
        />
      </Field>
      <Field
        label="Insurance expiry date"
        hint={locked ? lockedHint : "You stop receiving jobs when it expires, so keep it current."}
        error={errors.insuranceExpiresOn}
        required
      >
        <Input
          name="insuranceExpiresOn"
          type="date"
          min={locked ? undefined : minExpiry}
          defaultValue={values.insuranceExpiresOn}
          readOnly={locked}
        />
      </Field>
    </div>
  );
}
