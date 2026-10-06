import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";

import { SkeletonHeader, SkeletonPanel } from "../(customer)/_components/page-skeletons";

export default function SupportLoading() {
  return (
    <PageContainer>
      <LoadingState label="Loading your help requests…" className="space-y-8">
        <SkeletonHeader back />
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <SkeletonPanel className="space-y-5">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((tile) => (
                <Skeleton key={tile} className="h-16 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-32 rounded-xl" />
          </SkeletonPanel>
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            {[0, 1].map((row) => (
              <SkeletonPanel key={row}>
                <Skeleton className="h-4 w-40" />
                <SkeletonText lines={2} />
              </SkeletonPanel>
            ))}
          </div>
        </div>
      </LoadingState>
    </PageContainer>
  );
}
