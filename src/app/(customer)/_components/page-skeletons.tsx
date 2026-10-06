import type { ReactNode } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { LoadingState, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

/** A glass placeholder panel. */
export function SkeletonPanel({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn("glass-lite space-y-4 rounded-3xl p-5 sm:p-6", className)}>{children}</div>;
}

/** Page title placeholder: eyebrow, title, description. */
export function SkeletonHeader({ back = false }: { back?: boolean }) {
  return (
    <div className="space-y-3">
      {back ? <Skeleton className="h-8 w-32 rounded-full" /> : null}
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-10 w-[26rem] max-w-full rounded-xl" />
      <Skeleton className="h-5 w-[34rem] max-w-full" />
    </div>
  );
}

/** Loading placeholder for the list pages (/quotes, /bookings). */
export function ListPageSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <PageContainer>
      <LoadingState label={label} className="space-y-8">
        <SkeletonHeader />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((tile) => (
            <SkeletonPanel key={tile} className="h-36">
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="h-8 w-16" />
            </SkeletonPanel>
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          {Array.from({ length: rows }, (_, index) => (
            <SkeletonPanel key={index}>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-6 w-80 max-w-full" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                </div>
                <div className="space-y-2 sm:w-40">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-7 w-24" />
                </div>
              </div>
            </SkeletonPanel>
          ))}
        </div>
      </LoadingState>
    </PageContainer>
  );
}

/** Loading placeholder for detail pages with a side column (/bookings/[id], quote review). */
export function DetailPageSkeleton({ label }: { label: string }) {
  return (
    <PageContainer size="wide">
      <LoadingState label={label} className="space-y-8">
        <SkeletonHeader back />
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-6">
            {[0, 1, 2].map((card) => (
              <SkeletonPanel key={card}>
                <Skeleton className="h-5 w-40" />
                <SkeletonText lines={5} />
              </SkeletonPanel>
            ))}
          </div>
          <div className="space-y-6">
            <SkeletonPanel>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-12 w-44" />
              <Skeleton className="h-16 rounded-2xl" />
            </SkeletonPanel>
            <Skeleton className="h-40 rounded-3xl" />
          </div>
        </div>
      </LoadingState>
    </PageContainer>
  );
}
