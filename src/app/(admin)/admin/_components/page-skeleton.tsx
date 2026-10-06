import { LoadingState } from "@/components/ui/skeleton";

type PageSkeletonProps = {
  label: string;
  /** KPI tiles above the content (dashboard). */
  stats?: number;
  /** Rows of the main list or table. */
  rows?: number;
  /** Tabs above the list. */
  tabs?: boolean;
  /** A map panel above the list. */
  map?: boolean;
};

/** Shimmering placeholder for admin pages while their data loads (used by loading.tsx files). */
export function PageSkeleton({ label, stats = 0, rows = 5, tabs = false, map = false }: PageSkeletonProps) {
  return (
    <LoadingState label={label} className="space-y-8">
      <div className="space-y-3">
        <div className="shimmer h-3 w-40 rounded-full" />
        <div className="shimmer h-10 w-72 max-w-full rounded-xl" />
        <div className="shimmer h-4 w-[34rem] max-w-full rounded-full" />
      </div>
      {stats > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: stats }, (_, index) => (
            <div key={index} className="glass-lite space-y-4 rounded-2xl p-4 sm:p-5">
              <div className="shimmer size-8 rounded-xl" />
              <div className="shimmer h-3 w-24 rounded-full" />
              <div className="shimmer h-8 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      ) : null}
      {map ? <div className="shimmer h-72 rounded-2xl" /> : null}
      {tabs ? <div className="shimmer h-10 w-full max-w-xl rounded-xl" /> : null}
      <div className="glass-lite space-y-4 rounded-2xl p-4 sm:p-6">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-line pb-4 last:border-0 last:pb-0">
            <div className="shimmer size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="shimmer h-3.5 w-2/3 rounded-full" />
              <div className="shimmer h-3 w-1/2 rounded-full" />
            </div>
            <div className="shimmer hidden h-8 w-24 rounded-lg sm:block" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}
