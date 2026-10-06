import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <PageContainer size="narrow">
      <LoadingState label="Loading notifications…" className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <div className="glass-lite divide-y divide-line overflow-hidden rounded-2xl">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-4 px-4 py-4 sm:px-6">
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-56 max-w-full" />
                <SkeletonText lines={2} />
              </div>
            </div>
          ))}
        </div>
      </LoadingState>
    </PageContainer>
  );
}
