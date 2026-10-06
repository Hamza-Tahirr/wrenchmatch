import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function MechanicProfileLoading() {
  return (
    <PageContainer size="wide">
      <LoadingState label="Loading your profile…" className="space-y-6">
        <div className="glass grid-bg relative space-y-4 overflow-hidden rounded-3xl px-4 py-6 sm:px-8 sm:py-8">
          <Skeleton className="h-3 w-36 rounded-full" />
          <Skeleton className="h-11 w-64 max-w-full rounded-xl" />
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-5 w-96 max-w-full rounded-full" />
          <Skeleton className="absolute top-1/2 right-10 hidden size-40 -translate-y-1/2 rounded-full lg:block" />
        </div>
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
          <div className="space-y-6">
            {[0, 1, 2].map((section) => (
              <div key={section} className="glass-lite space-y-4 rounded-2xl p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-xl" />
                  <Skeleton className="h-6 w-56 max-w-full rounded-lg" />
                </div>
                <SkeletonText lines={4} />
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        </div>
      </LoadingState>
    </PageContainer>
  );
}
