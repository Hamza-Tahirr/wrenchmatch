"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  mechanicApplicationValuesFromFormData,
  parseMechanicApplicationForm,
  type MechanicApplicationFormValues,
  type MechanicFormState,
} from "@/lib/validation/mechanic";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { submitApplication } from "@/server/mechanic/application";
import { prepareApplicationUploads } from "@/server/mechanic/uploads";

import { formFailure, mergeFieldErrors } from "../_lib/action-state";

export type ApplicationFormState = MechanicFormState<MechanicApplicationFormValues>;

const FILES_AGAIN =
  "Your details are kept, but browsers can't keep chosen files after a refused submit: choose your documents again.";

/**
 * Submits the mechanic application: text fields and files are validated together so every
 * problem is reported at once; files are checked by their bytes and images sanitized before
 * the domain command stores everything in one transaction.
 */
export async function submitApplicationAction(
  _previous: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const viewer = await requireRole("mechanic", "/mechanic/apply");
  const values = mechanicApplicationValuesFromFormData(formData);
  const parsed = parseMechanicApplicationForm(values);
  const uploads = await prepareApplicationUploads(formData);
  if (!parsed.ok || !uploads.ok) {
    return {
      ok: false,
      formError: parsed.ok ? FILES_AGAIN : (parsed.formError ?? FILES_AGAIN),
      fieldErrors: mergeFieldErrors(parsed.ok ? undefined : parsed.fieldErrors, uploads.ok ? undefined : uploads.fieldErrors),
      values,
    };
  }
  try {
    await submitApplication(createAppContext(), viewer, parsed.data, uploads.value);
  } catch (error) {
    const state = formFailure(error, values);
    return state.ok ? state : { ...state, formError: state.formError ?? FILES_AGAIN };
  }
  revalidatePath("/mechanic/profile");
  revalidatePath("/mechanic/jobs");
  redirect("/mechanic/profile?submitted=1");
}
