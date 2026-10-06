import "server-only";

import {
  parseRepairRequestForm,
  REQUEST_PHOTO_FIELD,
  REQUEST_VIDEO_FIELD,
  type FieldErrors,
  type RequestFormValues,
} from "@/lib/validation/request";
import type { AppContext, Viewer } from "@/server/context";
import { filesFromFormData } from "@/server/storage/uploads";

import { assertCustomer } from "./access";
import { formFailure, type FormFailure } from "./form-errors";
import { prepareRequestUploads } from "./request-uploads";
import { submitRepairRequest, type SubmitRepairRequestResult } from "./requests";

// The whole repair-request form submission in one call, for the /request Server Action:
// parse the fields, prepare the photos and video, submit, and turn every problem into the
// form state the page renders. The action only adds requireRole and the redirect:
//
//   const state = await submitRepairRequestForm(createAppContext(), viewer, formData);
//   if (state.ok) redirect(`/requests/${state.requestId}`);
//   return state;

export type RequestFormState = ({ ok: true } & SubmitRepairRequestResult) | FormFailure<RequestFormValues>;

/** Added to the form error when files were chosen: browsers can't refill file inputs. */
export const CHOOSE_FILES_AGAIN = "Your photos and video weren't sent, so choose them again before you resubmit.";

/** The initial useActionState value: no errors, the fields filled with `values` (see getRequestFormDefaults). */
export function initialRequestFormState(values: RequestFormValues = {}): RequestFormState {
  return { ok: false, formError: null, fieldErrors: {}, values };
}

function withFilesNote(failure: FormFailure<RequestFormValues>, filesChosen: boolean): FormFailure<RequestFormValues> {
  if (!filesChosen) return failure;
  return { ...failure, formError: failure.formError ? `${failure.formError} ${CHOOSE_FILES_AGAIN}` : CHOOSE_FILES_AGAIN };
}

/**
 * Validates and submits the request form. Field and file problems come back together, keyed
 * by field name ("photos" / "video" for files); domain refusals (pilot ZIP, category, date
 * window, rate limit) come back as field errors or a form error. Unexpected failures throw.
 */
export async function submitRepairRequestForm(
  ctx: AppContext,
  viewer: Viewer,
  formData: FormData,
): Promise<RequestFormState> {
  assertCustomer(viewer);
  const filesChosen =
    filesFromFormData(formData, REQUEST_PHOTO_FIELD).length + filesFromFormData(formData, REQUEST_VIDEO_FIELD).length > 0;
  const parsed = parseRepairRequestForm(formData, { now: ctx.now });
  // Files are checked even when fields failed, so every problem shows at once.
  const uploads = await prepareRequestUploads(formData);

  if (!parsed.ok || !uploads.ok) {
    const fieldErrors: FieldErrors = {
      ...(parsed.ok ? {} : parsed.fieldErrors),
      ...(uploads.ok ? {} : uploads.fieldErrors),
    };
    return withFilesNote({ ok: false, formError: null, fieldErrors, values: parsed.values }, filesChosen);
  }

  try {
    const result = await submitRepairRequest(ctx, viewer, parsed.data, uploads.uploads);
    return { ok: true, ...result };
  } catch (error) {
    return withFilesNote(formFailure(error, parsed.values), filesChosen);
  }
}
