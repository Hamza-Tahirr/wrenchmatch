import { PageSkeleton } from "../_components/page-skeleton";

export default function MarketplaceLoading() {
  return <PageSkeleton label="Loading the marketplace…" tabs rows={8} />;
}
