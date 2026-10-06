import { PageSkeleton } from "../_components/page-skeleton";

export default function MailboxLoading() {
  return <PageSkeleton label="Loading the email outbox…" rows={8} />;
}
