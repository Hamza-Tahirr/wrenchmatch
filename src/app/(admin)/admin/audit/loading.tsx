import { PageSkeleton } from "../_components/page-skeleton";

export default function AuditLoading() {
  return <PageSkeleton label="Loading the audit log…" rows={10} />;
}
