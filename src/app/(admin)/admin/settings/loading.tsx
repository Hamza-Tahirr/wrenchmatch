import { PageSkeleton } from "../_components/page-skeleton";

export default function SettingsLoading() {
  return <PageSkeleton label="Loading settings…" rows={8} map />;
}
