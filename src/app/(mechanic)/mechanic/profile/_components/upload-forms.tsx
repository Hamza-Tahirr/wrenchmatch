"use client";

import { Upload } from "lucide-react";
import { startTransition } from "react";

import { Dropzone } from "@/components/media/dropzone";
import { UploadBudgetGuard } from "@/components/media/upload-budget-guard";
import { Field } from "@/components/ui/field";
import { FileInput } from "@/components/ui/file-input";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { MechanicDocumentFormValues, MechanicFormState } from "@/lib/validation/mechanic";
import type { MechanicFormOptions } from "@/server/mechanic/form-options";

import { BAR_CLEARANCE } from "../../_components/tap";
import { useVersionedActionState } from "../../_components/use-versioned-action-state";
import { addDocumentAction, replaceProfilePhotoFromDropzoneAction } from "../actions";
import { useEditableSection } from "./editable-section";
import { FormActions } from "./profile-forms";

const DOCUMENT_LABELS: Readonly<Record<string, string>> = {
  kind: "Document type",
  expiresOn: "Expiry date",
  document: "File",
};

const EMPTY_DOCUMENT: MechanicDocumentFormValues = { kind: "", expiresOn: "" };

/** Uploads one document for admin review (e.g. a renewed insurance certificate). */
export function DocumentUploadForm({
  documentKinds,
  limits,
}: {
  documentKinds: MechanicFormOptions["documentKinds"];
  limits: MechanicFormOptions["uploads"]["document"];
}) {
  const section = useEditableSection();
  const [state, dispatch, version] = useVersionedActionState<MechanicFormState<MechanicDocumentFormValues>>(
    async (previous, formData) => {
      const result = await addDocumentAction(previous, formData);
      if (result.ok) startTransition(() => section?.close(result.message));
      else toast.error("The document wasn't uploaded", { description: "Check the highlighted fields." });
      return result;
    },
    { ok: false },
  );
  const values = !state.ok && state.values ? state.values : EMPTY_DOCUMENT;
  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  return (
    <form key={version} action={dispatch} noValidate className={`space-y-5 ${BAR_CLEARANCE}`}>
      <FormErrorSummary
        title="The document wasn't uploaded"
        formError={state.ok ? null : state.formError}
        fieldErrors={errors}
        labels={DOCUMENT_LABELS}
        focusKey={version}
      />
      {!state.ok && state.values ? (
        <p className="text-sm text-fg-muted">For your security, choose the file again before you retry.</p>
      ) : null}
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label="Document type" error={errors.kind} required>
          <Select name="kind" placeholder="Choose a type" defaultValue={values.kind}>
            {documentKinds.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Expiry date" hint="For insurance or certificates that expire." error={errors.expiresOn} optional>
          <Input name="expiresOn" type="date" defaultValue={values.expiresOn} />
        </Field>
        <Field label="File" error={errors.document} required className="sm:col-span-2">
          <FileInput
            name="document"
            accept={limits.accept}
            acceptLabel={limits.acceptLabel}
            limitLabel={limits.limitLabel}
            maxFiles={1}
            maxFileSizeBytes={limits.maxBytes}
            budget={limits.budget}
          />
        </Field>
      </div>
      <UploadBudgetGuard budget={limits.budget} advice="Choose a smaller file: photos are resized for you, PDFs are sent as they are." />
      <p className="text-sm text-fg-muted">
        Documents are private: only you and admins can open them. Images are re-encoded with location data removed.
      </p>
      <FormActions label="Upload document" pendingText="Uploading…" icon={<Upload />} />
    </form>
  );
}

/** Replaces the public profile photo: drop, paste or choose one picture, preview it, upload it. */
export function ProfilePhotoForm({ limits }: { limits: MechanicFormOptions["uploads"]["profilePhoto"] }) {
  return (
    <Dropzone
      action={replaceProfilePhotoFromDropzoneAction}
      maxFiles={1}
      maxBytes={limits.maxBytes}
      budget={limits.budget}
      label="Drop a new profile photo"
      hint="Drag a picture here, paste it, or click to choose."
      submitVerb="Upload"
      compact
    />
  );
}
