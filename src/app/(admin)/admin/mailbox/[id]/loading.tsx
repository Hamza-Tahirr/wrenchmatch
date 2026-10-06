import { PageSkeleton } from "../../_components/page-skeleton";

export default function EmailLoading() {
  return <PageSkeleton label="Loading the email…" rows={3} />;
}
