import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";

import { SkeletonHeader, SkeletonPanel } from "../_components/page-skeletons";

export default function RequestLoading() {
  return (
    <PageContainer>
      <LoadingState label="Loading the request form…" className="space-y-8">
        <SkeletonHeader />
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <SkeletonPanel className="space-y-6">
            <div className="flex items-center justify-between">
              {[0, 1, 2, 3, 4].map((step) => (
                <Skeleton key={step} className="size-9 rounded-full" />
              ))}
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="size-12 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-56" />
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
            <SkeletonText lines={2} />
            <Skeleton className="ml-auto h-12 w-44 rounded-xl" />
          </SkeletonPanel>
          <Skeleton className="hidden h-96 rounded-3xl lg:block" />
        </div>
      </LoadingState>
    </PageContainer>
  );
}
