import "server-only";

import { sql, type Kysely } from "kysely";

import { MECHANIC_STATUSES } from "@/lib/domain";
import { formatMiles, pluralize } from "@/lib/format";
import type { AppContext, Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";
import { haversineMiles, roundMiles, type GeoPoint } from "@/server/matching/geo";
import { canViewFile } from "@/server/storage/file-access";

import type { MechanicBookingFacts } from "./eligibility";
import { groupBy, oneOf } from "./rows";

// A mechanic as customers may see them (ARCHITECTURE section 8): display name, experience,
// certifications, services, approximate area, genuine rating or "New", profile photo.
// mechanic_private (legal/business name, phone, email, garage address, policy number) is
// never read here, and neither is the bio. The only location is the base ZIP's centroid.
//
// Reviews: the rating counts genuine (non-fixture) reviews only. Seeded fixture reviews are
// never shown to other customers; the customer who wrote one still sees it, marked as not
// counted toward the rating.

export const RECENT_REVIEWS_SHOWN = 3;

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  /** Written by the viewing customer (shown as "Your review"). */
  byViewer: boolean;
  /** False only for the viewer's own review of a seeded booking, which never counts toward the rating. */
  countsTowardRating: boolean;
};

export type MechanicRating = {
  /** Reviews of genuine (non-fixture) completed jobs on the platform. */
  count: number;
  /** Their average, to one decimal; null when there are none. */
  average: number | null;
  /** "4.8 (12 reviews)", or "New" without genuine reviews. */
  label: string;
};

export type MechanicPublicProfile = {
  id: string;
  displayName: string;
  yearsExperience: number;
  certifications: string | null;
  /** Service categories offered; safety-sensitive ones only once an admin safety-approved them. */
  services: string[];
  /** "Based near Tempe, AZ": the base ZIP's city, never an address. */
  areaLabel: string;
  /** The base ZIP's centroid, for maps: an approximate point, never an address. */
  approxLocation: GeoPoint;
  /** Approximate miles between ZIP centroids from the reference point, when one was given. */
  distanceMiles: number | null;
  /** "about 8 mi" / "less than 1 mi" */
  distanceLabel: string | null;
  rating: MechanicRating;
  /** Newest first, at most RECENT_REVIEWS_SHOWN; reviewer identities are never included. */
  recentReviews: PublicReview[];
  /** The current profile photo when the viewer may see it: <img src={`/api/files/${id}`}>. */
  profilePhotoFileId: string | null;
};

export type MechanicForCustomer = {
  /** profilePhotoFileId is null here; withViewablePhotos fills it in after the file policy check. */
  profile: MechanicPublicProfile;
  /** The current profile photo before the policy check. Never sent to the browser as is. */
  photoFileId: string | null;
  /** For the booking-eligibility check; not part of the public profile. */
  bookingFacts: MechanicBookingFacts;
};

export type LoadMechanicsOptions = {
  /** The viewing customer: their own reviews of seeded bookings are included, marked as not counted. */
  viewerId?: string | null;
};

type ReviewAggregate = { mechanic_id: string; count: number; average: number | null };

function ratingFrom(aggregate: ReviewAggregate | undefined): MechanicRating {
  const count = Number(aggregate?.count ?? 0);
  const average =
    count > 0 && aggregate?.average != null ? Math.round(Number(aggregate.average) * 10) / 10 : null;
  return {
    count,
    average,
    label: average === null ? "New" : `${average.toFixed(1)} (${pluralize(count, "review")})`,
  };
}

/**
 * Public profiles (plus booking-eligibility facts) for the given mechanics. `from` is the
 * reference point for the approximate distance, normally the request's ZIP centroid.
 * Works on `ctx.db` or inside a transaction.
 */
export async function loadMechanicsForCustomer(
  db: Kysely<DB>,
  mechanicIds: readonly string[],
  from: GeoPoint | null,
  options: LoadMechanicsOptions = {},
): Promise<Map<string, MechanicForCustomer>> {
  const ids = [...new Set(mechanicIds)];
  if (ids.length === 0) return new Map();
  const viewerId = options.viewerId ?? null;

  const profiles = await db
    .selectFrom("mechanic_profiles as m")
    .innerJoin("users as u", "u.id", "m.user_id")
    .innerJoin("zip_centroids as z", "z.zip", "m.base_zip")
    .select([
      "m.user_id",
      "m.display_name",
      "m.years_experience",
      "m.certifications",
      "m.profile_photo_file_id",
      "m.status",
      "m.accepting_jobs",
      "m.insurance_provider",
      "m.insurance_expires_on",
      "u.disabled_at",
      "z.city",
      "z.state",
      "z.lat as zip_lat",
      "z.lng as zip_lng",
    ])
    .where("m.user_id", "in", ids)
    .execute();

  const services = await db
    .selectFrom("mechanic_services as s")
    .innerJoin("service_categories as c", "c.id", "s.category_id")
    .select(["s.mechanic_id", "c.name"])
    .where("s.mechanic_id", "in", ids)
    .where("c.enabled", "=", 1)
    .where((eb) => eb.or([eb("c.safety_sensitive", "=", 0), eb("s.safety_approved", "=", 1)]))
    .orderBy("c.sort_order")
    .execute();

  // Genuine reviews only: fixture reviews never count toward a rating.
  const aggregates = await db
    .selectFrom("reviews")
    .select((eb) => [
      "mechanic_id",
      eb.fn.countAll<number>().as("count"),
      eb.fn.avg<number | null>("rating").as("average"),
    ])
    .where("mechanic_id", "in", ids)
    .where("is_demo_fixture", "=", 0)
    .groupBy("mechanic_id")
    .execute();

  // Genuine reviews, plus the viewer's own fixture reviews; nobody else's fixture reviews.
  const recent = await db
    .selectFrom((eb) =>
      eb
        .selectFrom("reviews")
        .select([
          "id",
          "mechanic_id",
          "customer_id",
          "rating",
          "comment",
          "created_at",
          "is_demo_fixture",
          sql<number>`row_number() over (partition by mechanic_id order by created_at desc, id)`.as("position"),
        ])
        .where("mechanic_id", "in", ids)
        .where((inner) =>
          viewerId === null
            ? inner("is_demo_fixture", "=", 0)
            : inner.or([inner("is_demo_fixture", "=", 0), inner("customer_id", "=", viewerId)]),
        )
        .as("ranked"),
    )
    .select(["id", "mechanic_id", "customer_id", "rating", "comment", "created_at", "is_demo_fixture"])
    .where("position", "<=", RECENT_REVIEWS_SHOWN)
    .orderBy("created_at", "desc")
    .execute();

  const servicesBy = groupBy(services, (row) => row.mechanic_id);
  const aggregatesBy = new Map(aggregates.map((row) => [row.mechanic_id, row]));
  const recentBy = groupBy(recent, (row) => row.mechanic_id);

  const result = new Map<string, MechanicForCustomer>();
  for (const row of profiles) {
    const approxLocation = { lat: row.zip_lat, lng: row.zip_lng };
    const distanceMiles = from ? roundMiles(haversineMiles(from, approxLocation)) : null;
    result.set(row.user_id, {
      profile: {
        id: row.user_id,
        displayName: row.display_name,
        yearsExperience: row.years_experience,
        certifications: row.certifications,
        services: (servicesBy.get(row.user_id) ?? []).map((service) => service.name),
        areaLabel: `Based near ${row.city}, ${row.state}`,
        approxLocation,
        distanceMiles,
        distanceLabel: distanceMiles === null ? null : formatMiles(distanceMiles),
        rating: ratingFrom(aggregatesBy.get(row.user_id)),
        recentReviews: (recentBy.get(row.user_id) ?? []).map((review) => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.created_at,
          byViewer: viewerId !== null && review.customer_id === viewerId,
          countsTowardRating: review.is_demo_fixture === 0,
        })),
        profilePhotoFileId: null,
      },
      photoFileId: row.profile_photo_file_id,
      bookingFacts: {
        status: oneOf(MECHANIC_STATUSES, row.status, "mechanic_profiles.status"),
        acceptingJobs: row.accepting_jobs === 1,
        insuranceProvider: row.insurance_provider,
        insuranceExpiresOn: row.insurance_expires_on,
        accountDisabled: row.disabled_at !== null,
      },
    });
  }
  return result;
}

/**
 * The public profiles with `profilePhotoFileId` set only where the file policy lets the
 * viewer see the photo (canViewFile). Read paths only: canViewFile queries ctx.db.
 */
export async function withViewablePhotos(
  ctx: AppContext,
  viewer: Viewer,
  mechanics: ReadonlyMap<string, MechanicForCustomer>,
): Promise<Map<string, MechanicPublicProfile>> {
  const result = new Map<string, MechanicPublicProfile>();
  for (const [id, mechanic] of mechanics) {
    const visible = mechanic.photoFileId !== null && (await canViewFile(ctx, viewer, mechanic.photoFileId));
    result.set(id, { ...mechanic.profile, profilePhotoFileId: visible ? mechanic.photoFileId : null });
  }
  return result;
}
