import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function MechanicBookingLoading() {
  return (
    <PageContainer size="wide">
      <LoadingState label="Loading the booking…" className="space-y-6">
        <div className="glass grid-bg space-y-4 rounded-3xl px-4 py-6 sm:px-8 sm:py-8">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-3 w-40 rounded-full" />
          <Skeleton className="h-11 w-80 max-w-full rounded-xl" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-5 w-96 max-w-full rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:gap-x-8">
          <div className="space-y-6 lg:col-start-2 lg:row-start-1">
            <Skeleton className="h-40 rounded-2xl" />
          </div>
          <div className="space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <div className="glass-lite rounded-2xl p-5">
              <Skeleton className="mb-5 h-6 w-36 rounded-lg" />
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-5 md:gap-4">
                {[0, 1, 2, 3, 4].map((step) => (
                  <div key={step} className="flex items-center gap-3 md:flex-col">
                    <Skeleton className="size-8 rounded-full md:size-10" />
                    <Skeleton className="h-4 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-lite space-y-4 rounded-2xl p-6">
              <Skeleton className="h-6 w-48 rounded-lg" />
              <SkeletonText lines={3} />
            </div>
            <Skeleton className="h-80 rounded-2xl" />
          </div>
          <div className="space-y-6 lg:col-start-2 lg:row-start-2">
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        </div>
      </LoadingState>
    </PageContainer>
  );
}
