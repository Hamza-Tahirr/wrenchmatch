import { ListPageSkeleton } from "../../_components/page-skeletons";

export default function BookingsLoading() {
  return <ListPageSkeleton label="Loading your bookings…" rows={2} />;
}
