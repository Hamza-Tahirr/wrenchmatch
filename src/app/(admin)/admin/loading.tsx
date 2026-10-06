import { PageSkeleton } from "./_components/page-skeleton";

export default function AdminDashboardLoading() {
  return <PageSkeleton label="Loading the command center…" stats={8} rows={5} map />;
}
