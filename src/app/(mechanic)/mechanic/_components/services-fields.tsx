"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Checkbox, CheckboxGroup } from "@/components/ui/checkbox";
import type { FieldErrors, MechanicServicesFormValues } from "@/lib/validation/mechanic";
import type { MechanicFormOptions } from "@/server/mechanic/form-options";

import { CHECK_ROWS } from "./tap";

// Services offered (checkbox group "services"), and makes serviced: the "allMakes" checkbox
// or the checkbox group "makes". Brake and suspension work is marked as needing a separate
// admin safety approval.

/** Phones: the makes in two columns, 44 px tall labels 44 px apart (they never overlap). */
const MAKE_GRID = "max-sm:[&>div]:grid-cols-2 max-sm:[&>div]:gap-y-6 max-sm:[&_label]:-my-3 max-sm:[&_label]:py-3";

type ServicesFieldsProps = {
  values: MechanicServicesFormValues;
  errors: FieldErrors;
  options: Pick<MechanicFormOptions, "categories" | "makes">;
  /** Categories the mechanic already offers that an admin has since disabled (kept until removed). */
  extraCategories?: ReadonlyArray<{ id: string; name: string }>;
};

export const SERVICES_FIELD_LABELS: Readonly<Record<string, string>> = {
  services: "Services you offer",
  makes: "Makes you service",
};

export function ServicesFields({ values, errors, options, extraCategories = [] }: ServicesFieldsProps) {
  const [allMakes, setAllMakes] = useState(values.allMakes);
  return (
    <div className="space-y-8">
      <CheckboxGroup
        name="services"
        className={CHECK_ROWS}
        legend="Services you offer"
        hint="You're matched only to requests in these categories."
        columns={2}
        required
        defaultValues={values.services}
        error={errors.services}
        options={[
          ...options.categories.map((category) => ({
            value: category.id,
            label: category.safetySensitive ? (
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{category.name}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-800 ring-1 ring-warning-200 ring-inset">
                  <ShieldAlert aria-hidden="true" className="size-3.5" />
                  Needs admin safety approval
                </span>
              </span>
            ) : (
              <span className="font-medium">{category.name}</span>
            ),
            hint: category.safetyNote ? `${category.shortDescription} ${category.safetyNote}` : category.shortDescription,
          })),
          ...extraCategories.map((category) => ({
            value: category.id,
            label: <span className="font-medium">{category.name}</span>,
            hint: "No longer offered in the pilot. Uncheck it to remove it from your profile.",
          })),
        ]}
      />
      <div className="space-y-4">
        <Checkbox
          name="allMakes"
          className={CHECK_ROWS}
          label="I service all makes"
          hint="Uncheck to choose specific makes. Requests for other makes won't reach you."
          defaultChecked={values.allMakes}
          onChange={(event) => setAllMakes(event.currentTarget.checked)}
        />
        {allMakes ? null : (
          <CheckboxGroup
            name="makes"
            className={`${CHECK_ROWS} ${MAKE_GRID}`}
            legend="Makes you service"
            columns={3}
            required
            defaultValues={values.makes}
            error={errors.makes}
            options={options.makes.map((make) => ({ value: make, label: make }))}
          />
        )}
        {allMakes && errors.makes ? <p className="text-sm text-danger-700">{errors.makes[0]}</p> : null}
      </div>
    </div>
  );
}
