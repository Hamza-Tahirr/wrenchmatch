import { Hourglass, UserX } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { ACCOUNT_DELETION_DETAILS_MAX_LENGTH } from "@/lib/validation/support";

import { requestAccountDeletionAction } from "../actions";

const textLink = "font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800";

/**
 * "Delete your account" (MVP_PLAN section 10): asks the help desk to delete the account and
 * its personal data. Nothing is deleted automatically; the team confirms with the customer
 * first. Once asked, the section says so instead of offering the button again.
 */
export function AccountDeletion({ requested }: { requested: { requestedAt: string; timeZone: string } | null }) {
  return (
    <section
      aria-labelledby="account-deletion-title"
      className="glass-lite flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-fg/[0.06] text-fg-muted ring-1 ring-line-strong"
        >
          <UserX className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 id="account-deletion-title" className="font-display text-base font-semibold text-fg">
            Delete your account
          </h2>
          {requested ? (
            <p className="text-sm text-pretty text-fg-muted">
              You asked us on {formatDate(requested.requestedAt, requested.timeZone)}. Nothing has been deleted yet: our
              team will confirm with you first and reply on{" "}
              <Link href="/support" className={textLink}>
                your help requests
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-pretty text-fg-muted">
              Ask our team to delete your account and the personal data linked to it. Nothing is deleted automatically:
              we confirm with you first and tell you what has to be kept, such as booking records.
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 sm:pl-4">
        {requested ? (
          <Badge tone="warning" icon={<Hourglass />}>
            Deletion requested
          </Badge>
        ) : (
          <ConfirmDialog
            trigger="Request account deletion"
            triggerVariant="secondary"
            triggerIcon={<UserX />}
            tone="danger"
            title="Request account deletion?"
            description="We'll send this to the WrenchMatch team as a help request. Nothing is deleted right away: they'll confirm with you first, and you can keep using your account meanwhile."
            confirmLabel="Send deletion request"
            pendingLabel="Sending…"
            cancelLabel="Keep my account"
            action={requestAccountDeletionAction}
          >
            <Field
              label="Anything we should know?"
              name="details"
              optional
              hint="For example, why you're leaving. Please don't include card numbers or passwords."
            >
              <Textarea rows={3} maxLength={ACCOUNT_DELETION_DETAILS_MAX_LENGTH} />
            </Field>
          </ConfirmDialog>
        )}
      </div>
    </section>
  );
}
