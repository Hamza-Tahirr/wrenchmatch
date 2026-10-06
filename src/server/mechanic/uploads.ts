import "server-only";

import { formatBytes } from "@/lib/format";
import { MECHANIC_FORM_LIMITS, type FieldErrors } from "@/lib/validation/mechanic";
import { UPLOAD_LIMITS, type UploadPurpose } from "@/server/config";
import { DomainError, isDomainError } from "@/server/errors";
import { effectiveMaxBytes } from "@/server/storage/config";
import {
  filesFromFormData,
  prepareUpload,
  uploadBudgetProblem,
  uploadInputFromFile,
  type PreparedUpload,
} from "@/server/storage/uploads";

// Mechanic file uploads. Server Actions call the prepare* helpers before the domain command:
// they validate each file by its bytes and sanitize images (prepareUpload, outside any
// transaction because sharp is slow), and report problems per form field. The commands then
// store the prepared bytes (saveFile) inside their transaction.
//
// Form field names: application `profilePhoto` (optional), `idDocument`, `insuranceDocument`,
// `certificationDocs` (optional, up to 3); add-document form `document`; photo form `profilePhoto`.

/** A file already validated and sanitized by prepareUpload. */
export type MechanicUpload = { prepared: PreparedUpload; originalName: string | null };

export type ApplicationUploads = {
  profilePhoto?: MechanicUpload;
  idDocument: MechanicUpload;
  insuranceDocument: MechanicUpload;
  certificationDocs?: MechanicUpload[];
};

export type UploadPreparation<T> = { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors };

// The hosted site caps what one request can carry, so its limits may be lower than UPLOAD_LIMITS.
const DOCUMENT_TYPES = `a PDF, JPEG, PNG or WebP file up to ${formatBytes(effectiveMaxBytes("mechanic_document"))}`;

type FieldSpec = { purpose: UploadPurpose; required?: string; max: number; tooMany: string };

async function prepareField(formData: FormData, field: string, spec: FieldSpec): Promise<MechanicUpload[] | string> {
  const files = filesFromFormData(formData, field);
  if (files.length === 0) return spec.required ?? [];
  if (files.length > spec.max) return spec.tooMany;
  const uploads: MechanicUpload[] = [];
  for (const file of files) {
    try {
      uploads.push({ prepared: await prepareUpload(await uploadInputFromFile(file), spec.purpose), originalName: file.name });
    } catch (error) {
      if (isDomainError(error)) return error.userMessage;
      throw error;
    }
  }
  return uploads;
}

const SPECS = {
  profilePhoto: {
    purpose: "mechanic_profile_photo",
    max: 1,
    tooMany: "Choose one profile photo.",
  },
  idDocument: {
    purpose: "mechanic_document",
    required: `Upload a photo ID (driver's license or other government ID): ${DOCUMENT_TYPES}.`,
    max: 1,
    tooMany: "Upload one photo ID document.",
  },
  insuranceDocument: {
    purpose: "mechanic_document",
    required: `Upload your liability insurance certificate: ${DOCUMENT_TYPES}.`,
    max: 1,
    tooMany: "Upload one insurance certificate.",
  },
  certificationDocs: {
    purpose: "mechanic_document",
    max: MECHANIC_FORM_LIMITS.certificationDocsMax,
    tooMany: `Upload up to ${MECHANIC_FORM_LIMITS.certificationDocsMax} certification documents.`,
  },
} as const satisfies Record<string, FieldSpec>;

/** The field whose files are largest, where a "too large together" message is most useful. */
function largestFileField(formData: FormData, fields: readonly string[]): string {
  const total = (field: string) => filesFromFormData(formData, field).reduce((sum, file) => sum + file.size, 0);
  return fields.reduce((largest, field) => (total(field) > total(largest) ? field : largest));
}

/** Reads and prepares the application's files. Every problem is reported under its field name. */
export async function prepareApplicationUploads(formData: FormData): Promise<UploadPreparation<ApplicationUploads>> {
  const overBudget = uploadBudgetProblem(formData);
  if (overBudget) return { ok: false, fieldErrors: { [largestFileField(formData, Object.keys(SPECS))]: [overBudget] } };
  const fieldErrors: FieldErrors = {};
  const results: Partial<Record<keyof typeof SPECS, MechanicUpload[]>> = {};
  for (const field of Object.keys(SPECS) as (keyof typeof SPECS)[]) {
    const result = await prepareField(formData, field, SPECS[field]);
    if (typeof result === "string") fieldErrors[field] = [result];
    else results[field] = result;
  }
  const idDocument = results.idDocument?.[0];
  const insuranceDocument = results.insuranceDocument?.[0];
  if (Object.keys(fieldErrors).length > 0 || !idDocument || !insuranceDocument) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    value: {
      profilePhoto: results.profilePhoto?.[0],
      idDocument,
      insuranceDocument,
      certificationDocs: results.certificationDocs ?? [],
    },
  };
}

async function prepareSingle(
  formData: FormData,
  field: string,
  spec: FieldSpec & { required: string },
): Promise<UploadPreparation<MechanicUpload>> {
  const overBudget = uploadBudgetProblem(formData);
  if (overBudget) return { ok: false, fieldErrors: { [field]: [overBudget] } };
  const result = await prepareField(formData, field, spec);
  if (typeof result === "string") return { ok: false, fieldErrors: { [field]: [result] } };
  return { ok: true, value: result[0] };
}

/** The add-document form's file (default field "document"). */
export function prepareDocumentUpload(formData: FormData, field = "document"): Promise<UploadPreparation<MechanicUpload>> {
  return prepareSingle(formData, field, {
    purpose: "mechanic_document",
    required: `Choose a document to upload: ${DOCUMENT_TYPES}.`,
    max: 1,
    tooMany: "Upload one document at a time.",
  });
}

/** The profile-photo form's file (default field "profilePhoto"). */
export function prepareProfilePhotoUpload(
  formData: FormData,
  field = "profilePhoto",
): Promise<UploadPreparation<MechanicUpload>> {
  return prepareSingle(formData, field, {
    purpose: "mechanic_profile_photo",
    required: `Choose a photo: a JPEG, PNG or WebP image up to ${formatBytes(effectiveMaxBytes("mechanic_profile_photo"))}.`,
    max: 1,
    tooMany: SPECS.profilePhoto.tooMany,
  });
}

/**
 * Re-checks a prepared upload against its purpose before it is stored (defense in depth for
 * callers that prepared it themselves). Throws DomainError("invalid_input") naming `field`.
 */
export function assertUploadFor(upload: MechanicUpload, purpose: UploadPurpose, field: string): void {
  const limit = UPLOAD_LIMITS[purpose];
  const { prepared } = upload;
  const typeOk = (limit.mimeTypes as readonly string[]).includes(prepared.mimeType);
  const imageOk = !prepared.mimeType.startsWith("image/") || prepared.metadataStripped;
  if (!typeOk || !imageOk || prepared.buffer.byteLength === 0 || prepared.buffer.byteLength > limit.maxBytes) {
    const message = "That file can't be used here. Choose the file again.";
    throw new DomainError("invalid_input", message, { fieldErrors: { [field]: [message] } });
  }
}
