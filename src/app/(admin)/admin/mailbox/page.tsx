import { Funnel, Mail, MailWarning } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Select } from "@/components/ui/select";
import { pluralize } from "@/lib/format";
import { mailboxListQuerySchema } from "@/lib/validation/admin";
import { listCapturedEmails } from "@/server/admin/mailbox";

import { NeonChip } from "../_components/badges";
import { ConsoleEmpty, ConsoleHeader, ConsoleNote } from "../_components/console";
import { Timestamp } from "../_components/timestamp";
import { AdminPagination } from "../_components/touch";
import { roleLabel, templateLabel, withQuery } from "../_lib/display";
import { adminPage } from "../_lib/page-context";
import { TAP_TARGET } from "../_lib/ui";

export const metadata: Metadata = { title: "Email outbox" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MailboxPage({ searchParams }: PageProps) {
  const { viewer, ctx, shell } = await adminPage("/admin/mailbox");
  const filters = mailboxListQuerySchema.parse(await searchParams);
  const mailbox = await listCapturedEmails(ctx, viewer, filters);
  const href = (page: number) => withQuery("/admin/mailbox", { template: filters.template, page });

  return (
    <div className="space-y-6">
      <ConsoleHeader
        eyebrow="Admin / Email outbox"
        title="Email outbox"
        description="Every email the app would send, captured locally so you can read it. Newest first."
        meta={
          <>
            <NeonChip tone="warning" icon={<MailWarning />}>
              Local capture · not sent
            </NeonChip>
            <NeonChip tone="info">{pluralize(mailbox.totalCount, "captured email")}</NeonChip>
          </>
        }
      />

      <ConsoleNote icon={<MailWarning />} tone="warning" title="Email outbox (local capture - not sent)">
        No email provider is connected. Messages are stored in the local database instead of being delivered, and
        notification emails never contain contact details or exact addresses.
      </ConsoleNote>

      <Form action="/admin/mailbox" aria-label="Filter captured emails" className="glass-lite flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-sm">
          <label htmlFor="mailbox-template" className="block text-sm font-medium text-fg">
            Email type
          </label>
          <Select id="mailbox-template" name="template" defaultValue={filters.template ?? ""}>
            <option value="">Every email type</option>
            {mailbox.templates.map((template) => (
              <option key={template} value={template}>
                {templateLabel(template)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2 max-sm:[&>*]:flex-1">
          <Button type="submit" variant="secondary" leadingIcon={<Funnel />} className={TAP_TARGET}>
            Apply
          </Button>
          {filters.template ? (
            <ButtonLink href="/admin/mailbox" variant="ghost" className={TAP_TARGET}>
              Clear
            </ButtonLink>
          ) : null}
        </div>
      </Form>

      <p className="font-mono text-xs text-fg-subtle" role="status">
        {pluralize(mailbox.totalCount, "captured email")}
        {filters.template ? ` of type “${templateLabel(filters.template)}”` : ""}.
      </p>

      {mailbox.items.length > 0 ? (
        <ul aria-label="Captured emails, newest first" className="glass-lite stagger-children divide-y divide-line overflow-hidden rounded-2xl">
          {mailbox.items.map((email) => (
            <li key={email.id} className="group relative flex gap-3 px-4 py-3.5 transition-colors hover:bg-fg/[0.035] sm:px-5">
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/25 transition-shadow group-hover:shadow-[0_0_16px_-4px_var(--color-neon-cyan)]"
              >
                <Mail className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="min-w-0 truncate text-sm font-semibold text-fg">
                    {/* The overlay makes the whole row clickable; the link text is the subject. */}
                    <Link href={`/admin/mailbox/${email.id}`} className="after:absolute after:inset-0 group-hover:text-neon-cyan">
                      {email.subject}
                    </Link>
                  </p>
                  <p className="shrink-0 font-mono text-xs text-fg-subtle">
                    <Timestamp iso={email.createdAt} timeZone={shell.reportingTimeZone} format="relative" now={ctx.now} />
                  </p>
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
                  <span className="font-mono text-xs wrap-anywhere">To {email.toEmail}</span>
                  {email.recipient ? (
                    <span className="text-xs">
                      ({email.recipient.displayName}, {roleLabel(email.recipient.role).toLowerCase()})
                    </span>
                  ) : (
                    <span className="text-xs">(no account yet)</span>
                  )}
                  <NeonChip tone="neutral">{templateLabel(email.template)}</NeonChip>
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-fg-subtle">{email.preview}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ConsoleEmpty illustration="no-notifications" title="No captured emails">
          {filters.template ? "No emails of this type yet." : "Emails appear here when the app notifies someone."}
        </ConsoleEmpty>
      )}

      {mailbox.totalPages > 1 ? (
        <AdminPagination
          label="Outbox pages"
          page={mailbox.page}
          totalPages={mailbox.totalPages}
          prevHref={mailbox.page > 1 ? href(mailbox.page - 1) : null}
          nextHref={mailbox.page < mailbox.totalPages ? href(mailbox.page + 1) : null}
        />
      ) : null}
    </div>
  );
}
