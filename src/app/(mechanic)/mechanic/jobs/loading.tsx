import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function JobBoardLoading() {
  return (
    <PageContainer size="wide">
      <LoadingState label="Loading your job board…" className="space-y-6">
        <div className="glass grid-bg relative overflow-hidden rounded-3xl px-4 py-6 sm:px-8 sm:py-8">
          <div className="space-y-4 lg:pr-72">
            <Skeleton className="h-3 w-40 rounded-full" />
            <Skeleton className="h-11 w-56 rounded-xl" />
            <Skeleton className="h-7 w-52 rounded-full" />
            <SkeletonText lines={2} className="max-w-2xl" />
          </div>
          <Skeleton className="absolute top-1/2 right-10 hidden size-44 -translate-y-1/2 rounded-full lg:block" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <div key={card} className="glass-lite flex min-h-16 items-center gap-3 rounded-2xl p-3 sm:block sm:space-y-3 sm:p-5">
              <Skeleton className="size-9 shrink-0 rounded-xl sm:hidden" />
              <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
                <Skeleton className="hidden h-3 w-24 rounded-full sm:block" />
                <Skeleton className="h-6 w-10 rounded-lg sm:h-9 sm:w-12" />
                <Skeleton className="h-3 w-20 max-w-full rounded-full sm:w-32" />
              </div>
            </div>
          ))}
        </div>
        {/* Phones: tabs, the map, then the list (as on the page); lg: the map on the right. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:gap-x-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <Skeleton className="h-24 w-full rounded-2xl sm:h-14 lg:col-start-1 lg:row-start-1" />
          <Skeleton className="h-[clamp(12.5rem,32vh,20rem)] rounded-2xl lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[min(38rem,calc(100vh-12rem))]" />
          <div className="space-y-5 lg:col-start-1 lg:row-start-2">
            {[0, 1].map((card) => (
              <div key={card} className="glass-lite space-y-4 rounded-2xl p-5">
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <Skeleton className="h-3 w-40 rounded-full" />
                <Skeleton className="h-7 w-64 max-w-full rounded-lg" />
                <SkeletonText lines={2} />
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3].map((chip) => (
                    <Skeleton key={chip} className="h-7 w-28 rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </LoadingState>
    </PageContainer>
  );
}
