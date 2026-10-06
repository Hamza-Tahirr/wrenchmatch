import { PageSkeleton } from "../_components/page-skeleton";

export default function MatchingLoading() {
  return <PageSkeleton label="Loading matching diagnostics…" rows={4} map />;
}
