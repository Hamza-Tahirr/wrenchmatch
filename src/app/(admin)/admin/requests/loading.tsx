import { PageSkeleton } from "../_components/page-skeleton";

export default function RequestsLoading() {
  return <PageSkeleton label="Loading repair requests…" tabs rows={8} />;
}
