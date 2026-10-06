import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton } from "@/components/ui/skeleton";

export default function AccountPhotoLoading() {
  return (
    <PageContainer size="narrow">
      <LoadingState label="Loading your profile picture…" className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <div className="glass flex flex-col items-center gap-6 rounded-3xl p-6 sm:flex-row sm:p-8">
          <Skeleton className="size-36 rounded-full sm:size-40" />
          <div className="w-full flex-1 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-10 w-44 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-40 rounded-2xl" />
      </LoadingState>
    </PageContainer>
  );
}
