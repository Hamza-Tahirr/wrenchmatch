import { describe, expect, it } from "vitest";

import { EARTH_RADIUS_MILES, haversineMiles, roundMiles, type GeoPoint } from "@/server/matching/geo";

// Approximate test centroids (tests/support/factories.ts TEST_ZIPS).
const PHOENIX: GeoPoint = { lat: 33.451, lng: -112.069 };
const TEMPE: GeoPoint = { lat: 33.428, lng: -111.933 };
const MESA: GeoPoint = { lat: 33.435, lng: -111.848 };
const FLAGSTAFF: GeoPoint = { lat: 35.186, lng: -111.667 };

const MILES_PER_DEGREE = (EARTH_RADIUS_MILES * Math.PI) / 180; // about 69.09

describe("haversineMiles", () => {
  it("is zero between a point and itself", () => {
    expect(haversineMiles(PHOENIX, PHOENIX)).toBe(0);
  });

  it("is symmetric", () => {
    expect(haversineMiles(PHOENIX, MESA)).toBe(haversineMiles(MESA, PHOENIX));
  });

  it("uses an Earth radius of 3958.8 miles", () => {
    expect(EARTH_RADIUS_MILES).toBe(3958.8);
    // One degree along a meridian or the equator is radius x pi / 180.
    expect(haversineMiles({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(MILES_PER_DEGREE, 9);
    expect(haversineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(MILES_PER_DEGREE, 9);
    expect(MILES_PER_DEGREE).toBeCloseTo(69.09, 2);
  });

  it("matches the published reference value for Nashville to Los Angeles", () => {
    // Rosetta Code's haversine example: 2887.2599506071106 km with a 6372.8 km radius.
    const expected = (2887.2599506071106 / 6372.8) * EARTH_RADIUS_MILES;
    expect(haversineMiles({ lat: 36.12, lng: -86.67 }, { lat: 33.94, lng: -118.4 })).toBeCloseTo(expected, 6);
  });

  it("shrinks degrees of longitude toward the poles", () => {
    const atEquator = haversineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    const at60North = haversineMiles({ lat: 60, lng: 0 }, { lat: 60, lng: 1 });
    expect(at60North / atEquator).toBeCloseTo(0.5, 3);
  });

  it("gives plausible distances between the Phoenix-area test ZIPs", () => {
    expect(haversineMiles(PHOENIX, TEMPE)).toBeCloseTo(8.0, 1);
    expect(haversineMiles(PHOENIX, MESA)).toBeCloseTo(12.79, 2);
    expect(haversineMiles(PHOENIX, FLAGSTAFF)).toBeCloseTo(122.05, 2);
  });

  it("crosses the antimeridian the short way", () => {
    expect(haversineMiles({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 })).toBeCloseTo(MILES_PER_DEGREE, 9);
  });

  it("returns half the circumference for antipodal points instead of NaN", () => {
    const halfCircumference = Math.PI * EARTH_RADIUS_MILES;
    expect(haversineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(halfCircumference, 6);
    expect(haversineMiles({ lat: 90, lng: 0 }, { lat: -90, lng: 0 })).toBeCloseTo(halfCircumference, 6);
    expect(haversineMiles({ lat: 33.451, lng: -112.069 }, { lat: -33.451, lng: 67.931 })).toBeCloseTo(
      halfCircumference,
      6,
    );
  });

  it("rejects coordinates that are out of range or not finite", () => {
    const invalid: GeoPoint[] = [
      { lat: 90.0001, lng: 0 },
      { lat: -91, lng: 0 },
      { lat: 0, lng: 180.5 },
      { lat: 0, lng: -181 },
      { lat: Number.NaN, lng: 0 },
      { lat: 0, lng: Number.POSITIVE_INFINITY },
    ];
    for (const point of invalid) {
      expect(() => haversineMiles(PHOENIX, point), JSON.stringify(point)).toThrow(RangeError);
      expect(() => haversineMiles(point, PHOENIX), JSON.stringify(point)).toThrow(RangeError);
    }
  });
});

describe("roundMiles", () => {
  it("rounds to hundredths of a mile", () => {
    expect(roundMiles(0)).toBe(0);
    expect(roundMiles(3.14159)).toBe(3.14);
    expect(roundMiles(12.789)).toBe(12.79);
    expect(roundMiles(0.004)).toBe(0);
  });

  it("absorbs floating-point noise around whole distances", () => {
    expect(roundMiles(10.000000000000199)).toBe(10);
    expect(roundMiles(14.999999999999808)).toBe(15);
    expect(roundMiles(10.00999999999984)).toBe(10.01);
  });
});
