import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function MechanicApplyLoading() {
  return (
    <PageContainer>
      <LoadingState label="Loading the mechanic application…" className="space-y-6">
        <div className="glass grid-bg space-y-4 rounded-3xl px-4 py-6 sm:px-8 sm:py-8">
          <Skeleton className="h-3 w-40 rounded-full" />
          <Skeleton className="h-11 w-96 max-w-full rounded-xl" />
          <Skeleton className="h-5 w-[36rem] max-w-full rounded-full" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-20 rounded-2xl" />
            ))}
          </div>
        </div>
        <Skeleton className="h-16 rounded-2xl" />
        {[0, 1].map((section) => (
          <div key={section} className="glass-lite space-y-5 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-6 w-48 rounded-lg" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {[0, 1, 2, 3].map((field) => (
                <div key={field} className="space-y-2">
                  <Skeleton className="h-4 w-32 rounded-full" />
                  <Skeleton className="h-11 rounded-xl" />
                </div>
              ))}
            </div>
            <SkeletonText lines={2} />
          </div>
        ))}
      </LoadingState>
    </PageContainer>
  );
}
