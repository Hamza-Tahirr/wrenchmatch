import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton } from "@/components/ui/skeleton";

export default function MechanicGalleryLoading() {
  return (
    <PageContainer size="wide">
      <LoadingState label="Loading your work gallery…" className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-[32rem] max-w-full" />
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((tile) => (
              <div key={tile} className="glass-lite overflow-hidden rounded-2xl">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </div>
        </div>
      </LoadingState>
    </PageContainer>
  );
}
