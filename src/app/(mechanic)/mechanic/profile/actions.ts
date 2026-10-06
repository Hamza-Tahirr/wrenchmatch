"use server";

import { revalidatePath } from "next/cache";

import { PHOTO_FIELD, type MediaActionState } from "@/components/media/media-types";
import {
  acceptingJobsFromFormData,
  mechanicAvailabilityValuesFromFormData,
  mechanicDocumentValuesFromFormData,
  mechanicProfileValuesFromFormData,
  mechanicServicesValuesFromFormData,
  parseMechanicAvailabilityForm,
  parseMechanicDocumentForm,
  parseMechanicProfileForm,
  parseMechanicServicesForm,
  type ActionResult,
  type MechanicAvailabilityFormValues,
  type MechanicDocumentFormValues,
  type MechanicFormState,
  type MechanicProfileFormValues,
  type MechanicServicesFormValues,
} from "@/lib/validation/mechanic";
import { parseAccountDeletionForm } from "@/lib/validation/support";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { resubmitApplication } from "@/server/mechanic/application";
import {
  addDocument,
  replaceProfilePhoto,
  setAcceptingJobs,
  setAvailability,
  updateProfile,
  updateServicesAndMakes,
} from "@/server/mechanic/profile-commands";
import { prepareDocumentUpload, prepareProfilePhotoUpload } from "@/server/mechanic/uploads";
import { requestAccountDeletion } from "@/server/support/requests";

import { actionFailure, formFailure, mergeFieldErrors } from "../_lib/action-state";

// Server Actions of /mechanic/profile. Each re-checks the role, parses the form with the
// shared schema, runs the domain command (which validates again) and refreshes the pages
// that show the changed data.

const PROFILE_PATH = "/mechanic/profile";

function refreshMechanicPages(): void {
  revalidatePath(PROFILE_PATH);
  revalidatePath("/mechanic/jobs");
}

export async function updateProfileAction(
  _previous: MechanicFormState<MechanicProfileFormValues>,
  formData: FormData,
): Promise<MechanicFormState<MechanicProfileFormValues>> {
  const viewer = await requireRole("mechanic", PROFILE_PATH);
  const values = mechanicProfileValuesFromFormData(formData);
  const parsed = parseMechanicProfileForm(values);
  if (!parsed.ok) return { ok: false, formError: parsed.formError, fieldErrors: parsed.fieldErrors, values };
  try {
    await updateProfile(createAppContext(), viewer, parsed.data);
  } catch (error) {
    return formFailure(error, values);
  }
  refreshMechanicPages();
  return { ok: true, message: "Profile details saved" };
}

export async function updateServicesAction(
  _previous: MechanicFormState<MechanicServicesFormValues>,
  formData: FormData,
): Promise<MechanicFormState<MechanicServicesFormValues>> {
  const viewer = await requireRole("mechanic", PROFILE_PATH);
  const values = mechanicServicesValuesFromFormData(formData);
  const parsed = parseMechanicServicesForm(values);
  if (!parsed.ok) return { ok: false, formError: parsed.formError, fieldErrors: parsed.fieldErrors, values };
  let pendingSafetyReview: string[];
  try {
    ({ pendingSafetyReview } = await updateServicesAndMakes(createAppContext(), viewer, parsed.data));
  } catch (error) {
    return formFailure(error, values);
  }
  refreshMechanicPages();
  return {
    ok: true,
    message:
      pendingSafetyReview.length > 0
        ? "Services saved - safety-critical work waits for an admin safety review"
        : "Services and makes saved",
  };
}

export async function updateAvailabilityAction(
  _previous: MechanicFormState<MechanicAvailabilityFormValues>,
  formData: FormData,
): Promise<MechanicFormState<MechanicAvailabilityFormValues>> {
  const viewer = await requireRole("mechanic", PROFILE_PATH);
  const values = mechanicAvailabilityValuesFromFormData(formData);
  const parsed = parseMechanicAvailabilityForm(values);
  if (!parsed.ok) return { ok: false, formError: parsed.formError, fieldErrors: parsed.fieldErrors, values };
  try {
    await setAvailability(createAppContext(), viewer, parsed.data);
  } catch (error) {
    return formFailure(error, values);
  }
  refreshMechanicPages();
  return { ok: true, message: "Weekly availability saved" };
}

/** Pauses or resumes new jobs (hidden input "acceptingJobs" = "true" | "false"). */
export async function setAcceptingJobsAction(formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("mechanic", PROFILE_PATH);
  let accepting: boolean;
  try {
    ({ acceptingJobs: accepting } = await setAcceptingJobs(createAppContext(), viewer, acceptingJobsFromFormData(formData)));
  } catch (error) {
    return actionFailure(error);
  }
  refreshMechanicPages();
  return { ok: true, message: accepting ? "You're accepting new jobs again" : "New jobs are paused" };
}

export async function addDocumentAction(
  _previous: MechanicFormState<MechanicDocumentFormValues>,
  formData: FormData,
): Promise<MechanicFormState<MechanicDocumentFormValues>> {
  const viewer = await requireRole("mechanic", PROFILE_PATH);
  const values = mechanicDocumentValuesFromFormData(formData);
  const parsed = parseMechanicDocumentForm(values);
  const upload = await prepareDocumentUpload(formData);
  if (!parsed.ok || !upload.ok) {
    return {
      ok: false,
      formError: parsed.ok ? undefined : parsed.formError,
      fieldErrors: mergeFieldErrors(parsed.ok ? undefined : parsed.fieldErrors, upload.ok ? undefined : upload.fieldErrors),
      values,
    };
  }
  try {
    await addDocument(createAppContext(), viewer, parsed.data, upload.value);
  } catch (error) {
    return formFailure(error, values);
  }
  refreshMechanicPages();
  return { ok: true, message: "Document uploaded for admin review" };
}

/**
 * Replaces the public profile photo from the profile-photo dropzone (the media kit's action
 * shape: the picture arrives under "photos" and the result drives the dropzone's status and toasts).
 */
export async function replaceProfilePhotoFromDropzoneAction(
  previous: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const viewer = await requireRole("mechanic", PROFILE_PATH);
  const version = previous.version + 1;
  const upload = await prepareProfilePhotoUpload(formData, PHOTO_FIELD);
  if (!upload.ok) {
    const message = Object.values(upload.fieldErrors).flat()[0] ?? "The photo wasn't uploaded. Choose it again.";
    return { status: "error", message, errors: [], version };
  }
  try {
    await replaceProfilePhoto(createAppContext(), viewer, upload.value);
  } catch (error) {
    const failure = formFailure(error, {});
    const messages = failure.ok ? [] : [failure.formError, ...Object.values(failure.fieldErrors ?? {}).flat()];
    const message = messages.find((text): text is string => Boolean(text)) ?? "The photo wasn't uploaded.";
    return { status: "error", message, errors: [], version };
  }
  refreshMechanicPages();
  // The header shows a mechanic's profile photo as their avatar.
  revalidatePath("/", "layout");
  return { status: "success", message: "Profile photo updated.", errors: [], version };
}

/** Sends a rejected application back for review once the checklist is complete. */
export async function resubmitApplicationAction(): Promise<ActionResult> {
  const viewer = await requireRole("mechanic", PROFILE_PATH);
  try {
    await resubmitApplication(createAppContext(), viewer);
  } catch (error) {
    return actionFailure(error);
  }
  refreshMechanicPages();
  return { ok: true, message: "Application resubmitted for review" };
}

/**
 * "Request account deletion": the shared help-desk command opens an account help request
 * (topic "account") and notifies the admins. Nothing is deleted or disabled; the team confirms
 * with the mechanic first. Asking again while a request is open doesn't send another one.
 */
export async function requestAccountDeletionAction(formData: FormData): Promise<ActionResult> {
  const viewer = await requireRole("mechanic", PROFILE_PATH);
  const parsed = parseAccountDeletionForm(formData);
  if (!parsed.ok) {
    return { ok: false, formError: Object.values(parsed.fieldErrors).flat()[0] ?? "Check what you wrote and try again." };
  }
  let alreadyRequested: boolean;
  try {
    ({ alreadyRequested } = await requestAccountDeletion(createAppContext(), viewer, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
  revalidatePath(PROFILE_PATH);
  revalidatePath("/support");
  // The header's unread badge counts the "we received your request" notification.
  revalidatePath("/", "layout");
  return { ok: true, message: alreadyRequested ? "Your deletion request is already with our team" : "Deletion request sent" };
}
