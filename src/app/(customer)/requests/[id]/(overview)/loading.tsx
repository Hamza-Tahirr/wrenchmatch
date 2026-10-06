import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";

import { SkeletonHeader, SkeletonPanel } from "../../../_components/page-skeletons";

export default function RequestDetailLoading() {
  return (
    <PageContainer size="wide">
      <LoadingState label="Loading your request…" className="space-y-8">
        <SkeletonHeader back />
        <SkeletonPanel>
          <div className="flex items-center justify-between px-[6%]">
            {[0, 1, 2, 3, 4].map((step) => (
              <Skeleton key={step} className="size-9 rounded-full" />
            ))}
          </div>
        </SkeletonPanel>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((chip) => (
            <Skeleton key={chip} className="h-16 rounded-2xl" />
          ))}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
          <div className="space-y-5">
            {[0, 1].map((card) => (
              <SkeletonPanel key={card}>
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-24 rounded-2xl" />
                <SkeletonText lines={4} />
              </SkeletonPanel>
            ))}
          </div>
          <Skeleton className="h-[26rem] rounded-2xl" />
        </div>
      </LoadingState>
    </PageContainer>
  );
}
