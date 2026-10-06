import { PageSkeleton } from "../../_components/page-skeleton";

export default function RequestLoading() {
  return <PageSkeleton label="Loading the repair request…" rows={6} />;
}
