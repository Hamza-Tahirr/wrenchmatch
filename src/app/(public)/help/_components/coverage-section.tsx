import { MapLegend } from "@/components/map/map-legend";
import { MapView } from "@/components/map/map-view";
import type { MapCircle, MapPoint } from "@/components/map/geo";
import { Section } from "@/components/ui/section";
import { pluralize } from "@/lib/format";
import { getCoverage } from "@/server/catalog/coverage";
import { createAppContext } from "@/server/context";

/** "Where WrenchMatch works": enabled pilot ZIP areas (approximate centroids) and their cities. */
export async function CoverageSection() {
  const coverage = await getCoverage(createAppContext());
  if (coverage.zips.length === 0) return null;

  const circles: MapCircle[] = coverage.zips.map((zip) => ({
    id: `zip-${zip.zip}`,
    lat: zip.lat,
    lng: zip.lng,
    radiusMiles: 1.6,
    tone: "cyan",
    dashed: false,
  }));

  const cities = new Map<string, { lat: number; lng: number; count: number; state: string }>();
  for (const zip of coverage.zips) {
    const city = cities.get(zip.city) ?? { lat: 0, lng: 0, count: 0, state: zip.state };
    city.lat += zip.lat;
    city.lng += zip.lng;
    city.count += 1;
    cities.set(zip.city, city);
  }
  const points: MapPoint[] = [...cities.entries()].map(([name, city]) => ({
    id: `city-${name}`,
    lat: city.lat / city.count,
    lng: city.lng / city.count,
    label: name,
    description: `${name}, ${city.state} · ${pluralize(city.count, "pilot ZIP code")}`,
    tone: "violet",
  }));

  const metroNames = coverage.metros.map((metro) => metro.metroLabel).join(", ");

  return (
    <Section
      id="coverage"
      title="Where WrenchMatch works"
      description={`The pilot serves ${pluralize(coverage.zips.length, "ZIP code")} in the ${metroNames} area. Shaded areas are approximate.`}
    >
      <MapView
        label={`Pilot service area: ${metroNames} (approximate ZIP code areas)`}
        points={points}
        circles={circles}
        cluster={false}
        height="clamp(18rem, 48vh, 26rem)"
        listTitle="Cities in the pilot area"
        legend={
          <MapLegend
            items={[
              { tone: "cyan", label: "Pilot ZIP areas", kind: "area" },
              { tone: "violet", label: "Cities" },
            ]}
          />
        }
      />
    </Section>
  );
}
