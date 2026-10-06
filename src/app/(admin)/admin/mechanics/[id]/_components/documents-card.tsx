import { CircleCheck, CircleX, Download, ExternalLink, FileImage, FileText, FolderLock } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatBytes, formatDate } from "@/lib/format";
import { DOCUMENT_NOTE_MAX_LENGTH } from "@/lib/validation/admin";
import type { AdminMechanicDocument } from "@/server/admin/mechanics";

import { ActionDialog, type AdminFormAction } from "../../../_components/action-dialog";
import { DocumentStatusBadge } from "../../../_components/badges";
import { ConsoleEmpty, IconWell, Panel } from "../../../_components/console";
import { StatusSwap } from "../../../_components/status-swap";
import { Timestamp } from "../../../_components/timestamp";
import { TAP_TARGET } from "../../../_lib/ui";

const MIME_LABELS: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/webp": "WebP image",
};

function DocumentItem({
  document,
  mechanicName,
  timeZone,
  action,
}: {
  document: AdminMechanicDocument;
  mechanicName: string;
  timeZone: string;
  action: AdminFormAction;
}) {
  const isPdf = document.mimeType === "application/pdf";
  const fileName = document.originalName ?? `${document.kindLabel} (${MIME_LABELS[document.mimeType] ?? document.mimeType})`;
  // Phones: the file link across the top when both decisions are offered, the decisions side by side.
  const decisions = Number(document.status !== "verified") + Number(document.status !== "rejected");
  return (
    <li className="space-y-3 rounded-2xl border border-line bg-fg/[0.02] p-4 transition-colors hover:border-line-strong">
      <div className="flex gap-3">
        <IconWell
          icon={isPdf ? <FileText /> : <FileImage />}
          tone={document.status === "verified" ? "success" : document.status === "rejected" ? "danger" : "warning"}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            {document.kindLabel}
            <StatusSwap status={document.status}>
              <DocumentStatusBadge status={document.status} />
            </StatusSwap>
          </p>
          <p className="font-mono text-xs wrap-anywhere text-fg-subtle">
            {fileName} · {MIME_LABELS[document.mimeType] ?? document.mimeType} · {formatBytes(document.sizeBytes)}
          </p>
          <p className="text-xs text-fg-subtle">
            Uploaded <Timestamp iso={document.uploadedAt} timeZone={timeZone} format="date" />
            {document.expiresOn ? ` · expires ${formatDate(document.expiresOn)}` : ""}
          </p>
          {document.reviewedAt ? (
            <p className="text-xs text-fg-subtle">
              Reviewed <Timestamp iso={document.reviewedAt} timeZone={timeZone} format="date" />
              {document.reviewedBy ? ` by ${document.reviewedBy.displayName}` : ""}
              {document.reviewNote ? (
                <>
                  : <span className="text-fg-muted">&ldquo;{document.reviewNote}&rdquo;</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:pl-13">
        <a
          href={`/api/files/${document.fileId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: "secondary", size: "sm", className: cn(TAP_TARGET, decisions === 2 && "col-span-2") })}
        >
          {isPdf ? <Download aria-hidden="true" /> : <ExternalLink aria-hidden="true" />}
          {isPdf ? "Download PDF" : "View"}
          <span className="sr-only">
            {" "}
            {document.kindLabel} ({isPdf ? "downloads" : "opens in a new tab"}; each view is recorded in the audit log)
          </span>
        </a>
        {document.status !== "verified" ? (
          <ActionDialog
            trigger={
              <>
                Verify<span className="sr-only"> {document.kindLabel.toLowerCase()}</span>
              </>
            }
            triggerIcon={<CircleCheck />}
            title={`Verify ${mechanicName}'s ${document.kindLabel.toLowerCase()}?`}
            description="Confirm the document is legible, matches the application and (for insurance) is current."
            action={action}
            hiddenFields={{ documentId: document.id, status: "verified" }}
            fields={[
              {
                name: "note",
                label: "Note",
                optional: true,
                maxLength: DOCUMENT_NOTE_MAX_LENGTH,
                hint: "Shown to the mechanic and kept in the audit log.",
              },
            ]}
            confirmLabel="Mark verified"
            pendingLabel="Verifying…"
          />
        ) : null}
        {document.status !== "rejected" ? (
          <ActionDialog
            trigger={
              <>
                Reject<span className="sr-only"> {document.kindLabel.toLowerCase()}</span>
              </>
            }
            triggerIcon={<CircleX />}
            triggerVariant="secondary"
            title={`Reject ${mechanicName}'s ${document.kindLabel.toLowerCase()}?`}
            description="The mechanic is asked to upload a new copy and sees your note."
            action={action}
            hiddenFields={{ documentId: document.id, status: "rejected" }}
            fields={[
              {
                name: "note",
                label: "What's wrong with it? (shown to the mechanic)",
                required: true,
                maxLength: DOCUMENT_NOTE_MAX_LENGTH,
                hint: "For example: the photo is blurred, or the policy has expired. At least 3 characters.",
              },
            ]}
            confirmLabel="Reject document"
            pendingLabel="Rejecting…"
            tone="danger"
          />
        ) : null}
      </div>
    </li>
  );
}

/** Uploaded ID, insurance and certification documents, each with View and a review decision. */
export function DocumentsCard({
  documents,
  mechanicName,
  timeZone,
  action,
}: {
  documents: readonly AdminMechanicDocument[];
  mechanicName: string;
  timeZone: string;
  action: AdminFormAction;
}) {
  const pending = documents.filter((document) => document.status === "pending").length;
  return (
    <Panel
      title="Documents"
      icon={<FolderLock />}
      tone={pending > 0 ? "warning" : "cyan"}
      description={
        pending > 0
          ? `${pending} of ${documents.length} waiting for review. Files are private: only the mechanic and admins can open them, and every admin view is audited.`
          : "Files are private: only the mechanic and admins can open them, and every admin view is audited."
      }
    >
      {documents.length > 0 ? (
        <ul aria-label="Documents, newest first" className="stagger-children space-y-3">
          {documents.map((document) => (
            <DocumentItem key={document.id} document={document} mechanicName={mechanicName} timeZone={timeZone} action={action} />
          ))}
        </ul>
      ) : (
        <ConsoleEmpty bare headingLevel={3} illustration="upload-photos" title="No documents uploaded">
          The mechanic hasn&rsquo;t uploaded an ID or insurance certificate yet. Ask them to add one from their profile before
          approving.
        </ConsoleEmpty>
      )}
    </Panel>
  );
}
