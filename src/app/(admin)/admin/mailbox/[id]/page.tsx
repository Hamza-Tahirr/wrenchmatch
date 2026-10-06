import { Mail, MailWarning } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCapturedEmail } from "@/server/admin/mailbox";
import { isDomainError } from "@/server/errors";

import { NeonChip } from "../../_components/badges";
import { ConsoleHeader, ConsoleNote, FactGrid, Panel } from "../../_components/console";
import { Timestamp } from "../../_components/timestamp";
import { roleLabel, templateLabel } from "../../_lib/display";
import { adminPage } from "../../_lib/page-context";

export const metadata: Metadata = { title: "Captured email" };

type PageProps = { params: Promise<{ id: string }> };

export default async function CapturedEmailPage({ params }: PageProps) {
  const { id } = await params;
  const { viewer, ctx, shell } = await adminPage(`/admin/mailbox/${encodeURIComponent(id)}`);
  let email;
  try {
    email = await getCapturedEmail(ctx, viewer, id);
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <ConsoleHeader
        back={{ href: "/admin/mailbox", label: "Email outbox" }}
        eyebrow="Admin / Email outbox / Captured email"
        title={email.subject}
        meta={
          <>
            <NeonChip tone="warning" icon={<MailWarning />}>
              Local capture · not sent
            </NeonChip>
            <NeonChip tone="neutral">{templateLabel(email.template)}</NeonChip>
          </>
        }
      />

      <ConsoleNote icon={<MailWarning />} tone="warning">
        Captured locally: this message was never delivered. It shows exactly what the app would send once an email provider is
        connected.
      </ConsoleNote>

      <Panel as="article" title="Message" icon={<Mail />} variant="glass">
        <div className="space-y-6">
          <FactGrid
            columns={4}
            items={[
              { term: "To", description: <span className="font-mono text-xs wrap-anywhere">{email.toEmail}</span>, wide: true },
              {
                term: "Account",
                wide: true,
                description: email.recipient
                  ? `${email.recipient.displayName} (${roleLabel(email.recipient.role).toLowerCase()})`
                  : "No account with this address yet",
              },
              { term: "Captured", description: <Timestamp iso={email.createdAt} timeZone={shell.reportingTimeZone} /> },
              { term: "Delivery", description: "Captured locally, not sent" },
            ]}
          />
          <pre className="overflow-x-auto rounded-2xl border border-line bg-canvas/60 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-fg sm:p-6">
            {email.bodyText}
          </pre>
        </div>
      </Panel>
    </div>
  );
}
