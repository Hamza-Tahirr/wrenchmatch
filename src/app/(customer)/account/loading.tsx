import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";

import { SkeletonHeader, SkeletonPanel } from "../_components/page-skeletons";

export default function AccountLoading() {
  return (
    <PageContainer size="wide">
      <LoadingState label="Loading your account…" className="space-y-8">
        <SkeletonHeader />
        <div className="glass-lite flex items-center gap-4 rounded-3xl p-5 sm:p-6">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((tile) => (
            <Skeleton key={tile} className="h-36 rounded-3xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((card) => (
            <SkeletonPanel key={card}>
              <Skeleton className="h-5 w-44" />
              <SkeletonText lines={3} />
            </SkeletonPanel>
          ))}
        </div>
      </LoadingState>
    </PageContainer>
  );
}
