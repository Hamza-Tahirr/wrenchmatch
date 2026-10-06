import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function JobDetailLoading() {
  return (
    <PageContainer size="wide">
      <LoadingState label="Loading the job…" className="space-y-6">
        <div className="glass grid-bg space-y-4 rounded-3xl px-4 py-6 sm:px-8 sm:py-8">
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-3 w-44 rounded-full" />
          <Skeleton className="h-11 w-80 max-w-full rounded-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-36 rounded-full" />
          </div>
          <Skeleton className="h-5 w-96 max-w-full rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
          <div className="space-y-6 lg:col-start-2 lg:row-start-1">
            <div className="glass-lite space-y-4 rounded-2xl p-5">
              <Skeleton className="h-6 w-40 rounded-lg" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-11 rounded-xl" />
              <Skeleton className="h-11 rounded-xl" />
            </div>
            <Skeleton className="h-36 rounded-2xl" />
          </div>
          <div className="space-y-6 lg:col-start-1 lg:row-start-1">
            <Skeleton className="h-80 rounded-2xl" />
            <div className="glass-lite space-y-5 rounded-2xl p-6">
              <Skeleton className="h-6 w-40 rounded-lg" />
              <SkeletonText lines={4} />
              <div className="grid gap-5 sm:grid-cols-2">
                {[0, 1, 2, 3, 4, 5].map((item) => (
                  <Skeleton key={item} className="h-12 rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </LoadingState>
    </PageContainer>
  );
}
