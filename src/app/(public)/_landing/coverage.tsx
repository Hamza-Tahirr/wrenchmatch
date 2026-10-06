import { ArrowRight, MapPinned } from "lucide-react";

import { CoverageArt } from "@/components/illustrations";
import { MapLegend } from "@/components/map/map-legend";
import { MapView } from "@/components/map/map-view";
import type { MapCircle, MapPoint } from "@/components/map/geo";
import { LazyMount, ParallaxScene } from "@/components/parallax";
import { ButtonLink } from "@/components/ui/button-link";
import { getCoverage } from "@/server/catalog/coverage";
import { createAppContext } from "@/server/context";
import { Holo, SectionHeading } from "./section-heading";

/**
 * "Where we operate": the live pilot coverage map (public ZIP centroids and metro radii
 * only, no addresses or user data) floating over holographic terrain art.
 */
export async function Coverage() {
  const coverage = await getCoverage(createAppContext());
  const points: MapPoint[] = coverage.zips.map((zip) => ({
    id: `zip-${zip.zip}`,
    lat: zip.lat,
    lng: zip.lng,
    label: zip.zip,
    description: `${zip.areaLabel} · ${zip.metroLabel} pilot area`,
    tone: "cyan",
    hideLabel: true,
  }));
  const circles: MapCircle[] = coverage.metros.map((metro) => ({
    id: `metro-${metro.metroLabel}`,
    lat: metro.lat,
    lng: metro.lng,
    radiusMiles: metro.radiusMiles,
    tone: "violet",
    label: `${metro.metroLabel}: ${metro.zipCount} pilot ZIP codes`,
  }));
  const metroNames = coverage.metros.map((metro) => metro.metroLabel);

  return (
    <section aria-labelledby="coverage-title" className="relative isolate overflow-hidden py-16 sm:py-24">
      {/* Holographic terrain band behind the whole section; the map floats over it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent_0%,#000_34%,#000_84%,transparent_100%)]"
      >
        <ParallaxScene
          travel={0.2}
          className="absolute bottom-0 left-1/2 w-[max(100%,72rem)] -translate-x-1/2 [mask-image:linear-gradient(to_bottom,transparent_0%,#000_42%)] [mask-repeat:no-repeat]"
        >
          <LazyMount className="aspect-[16/9]">
            <CoverageArt daylight className="w-full" />
          </LazyMount>
        </ParallaxScene>
      </div>
      {/* Keeps the copy calm over the terrain on large screens. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-[-5] hidden w-[60%] bg-[linear-gradient(90deg,var(--color-canvas)_0%,color-mix(in_oklab,var(--color-canvas)_78%,transparent)_50%,transparent_100%)] [mask-image:linear-gradient(to_bottom,transparent_0%,#000_30%,#000_78%,transparent_100%)] lg:block"
      />
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14 lg:px-8">
        <div>
          <SectionHeading
            id="coverage-title"
            eyebrow="Where we operate"
            title={
              <>
                Piloting in <Holo>select ZIP codes</Holo>
              </>
            }
            description={
              <p>
                {metroNames.length > 0
                  ? `Right now WrenchMatch covers pilot ZIP codes in ${metroNames.join(" and ")}. Enter yours on the request form to check coverage.`
                  : "We are piloting in a limited set of ZIP codes. Enter yours on the request form to check coverage."}
              </p>
            }
          />
          <ul className="reveal mt-6 space-y-3 text-fg-muted">
            <li className="flex gap-3">
              <MapPinned aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-neon-cyan" />
              Points are ZIP-area centres, not addresses. Distances in the app are approximate.
            </li>
            <li className="flex gap-3">
              <MapPinned aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-neon-violet" />
              If no approved mechanic covers your request, you&rsquo;ll see that straight away.
            </li>
          </ul>
          <div className="reveal mt-8">
            <ButtonLink href="/request" variant="secondary" trailingIcon={<ArrowRight />}>
              Check your ZIP code
            </ButtonLink>
          </div>
        </div>
        <div className="relative">
          <div className="reveal-scale glass relative rounded-[1.75rem] p-2 shadow-glow sm:p-3">
            <MapView
              cluster={false}
              label="WrenchMatch pilot coverage (approximate ZIP areas)"
              points={points}
              circles={circles}
              height="clamp(20rem, 52vh, 30rem)"
              fitMaxZoom={9.5}
              list="toggle"
              listTitle="Pilot ZIP codes"
              legend={
                <MapLegend
                  items={[
                    { tone: "cyan", label: "Pilot ZIP area" },
                    { tone: "violet", label: "Metro coverage", kind: "ring" },
                  ]}
                />
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
