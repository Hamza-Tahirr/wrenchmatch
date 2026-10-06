import { Award, BadgeCheck, ChevronDown, MapPin, Sparkles, Wrench } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { formatDate, pluralize } from "@/lib/format";
import type { MechanicPublicProfile, MechanicRating, PublicReview } from "@/server/customer/mechanic-public";

import { Fact, FactList } from "./facts";
import { ratingText, Stars } from "./stars";

// A mechanic as customers see them before a confirmed booking (ARCHITECTURE section 8):
// display name, photo, genuine rating or "New", experience, certifications and an
// approximate area. Contact details are never part of these props.

function photoUrl(mechanic: MechanicPublicProfile): string | null {
  return mechanic.profilePhotoFileId ? `/api/files/${mechanic.profilePhotoFileId}` : null;
}

/** "★★★★★ 4.8 (12 reviews)" from genuine reviews, or a "New" chip. */
export function RatingSummary({ rating, className }: { rating: MechanicRating; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", className)}>
      {rating.average === null ? (
        <>
          <span className="inline-flex items-center gap-1 rounded-full border border-neon-cyan/30 bg-neon-cyan/10 px-2 py-0.5 text-xs font-semibold text-brand-800">
            <Sparkles aria-hidden="true" className="size-3" />
            New
          </span>
          <span className="text-fg-subtle">No reviews from completed jobs yet</span>
        </>
      ) : (
        <>
          <Stars rating={rating.average} />
          <span className="font-medium text-fg">
            <span className="sr-only">Rated {rating.average.toFixed(1)} out of 5 from </span>
            <span aria-hidden="true">{rating.label}</span>
            <span className="sr-only">{pluralize(rating.count, "review")}</span>
          </span>
        </>
      )}
    </div>
  );
}

/** Photo or initials, name and rating. */
export function MechanicIdentity({
  mechanic,
  size = "md",
  nameAs: Name = "p",
  className,
}: {
  mechanic: MechanicPublicProfile;
  size?: "md" | "lg";
  nameAs?: "p" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Avatar name={mechanic.displayName} src={photoUrl(mechanic)} size={size === "lg" ? "lg" : "md"} />
      <div className="min-w-0 space-y-1">
        <Name className={cn("font-display font-semibold tracking-tight text-fg", size === "lg" ? "text-xl" : "text-base")}>
          {mechanic.displayName}
        </Name>
        <RatingSummary rating={mechanic.rating} />
      </div>
    </div>
  );
}

/** Experience, certifications, approximate area and distance. */
export function MechanicFacts({ mechanic, className }: { mechanic: MechanicPublicProfile; className?: string }) {
  return (
    <FactList label={`About ${mechanic.displayName}`} className={cn("flex-col items-start", className)}>
      <Fact icon={<BadgeCheck />}>
        {pluralize(mechanic.yearsExperience, "year")} of experience · approved by WrenchMatch
      </Fact>
      {mechanic.certifications ? <Fact icon={<Award />}>{mechanic.certifications}</Fact> : null}
      <Fact icon={<MapPin />}>
        {mechanic.areaLabel}
        {mechanic.distanceLabel ? ` · ${mechanic.distanceLabel} away (approximate)` : null}
      </Fact>
      {mechanic.services.length > 0 ? (
        <Fact icon={<Wrench />}>
          <span className="text-fg-subtle">Services: </span>
          {mechanic.services.join(", ")}
        </Fact>
      ) : null}
    </FactList>
  );
}

function ReviewItem({ review }: { review: PublicReview }) {
  return (
    <li className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Stars rating={review.rating} />
        <span className="sr-only">{ratingText(review.rating)}</span>
        <span className="font-mono text-xs text-fg-subtle tabular">{formatDate(review.createdAt)}</span>
        {review.byViewer ? (
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-fg-muted">
            {review.countsTowardRating ? "Your review" : "Your review · not counted in the rating"}
          </span>
        ) : null}
      </div>
      {review.comment ? <p className="text-sm text-pretty text-fg-muted">&ldquo;{review.comment}&rdquo;</p> : null}
    </li>
  );
}

/** The mechanic's most recent reviews (reviewer identities are never shown). */
export function RecentReviews({ mechanic, className }: { mechanic: MechanicPublicProfile; className?: string }) {
  if (mechanic.recentReviews.length === 0) return null;
  return (
    <details className={cn("group rounded-2xl border border-line bg-surface-2/50", className)}>
      <summary className="flex min-h-11 items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-fg/5">
        Recent reviews ({mechanic.recentReviews.length})
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
      </summary>
      <ul className="space-y-3 border-t border-line px-4 py-3">
        {mechanic.recentReviews.map((review) => (
          <ReviewItem key={review.id} review={review} />
        ))}
      </ul>
    </details>
  );
}
