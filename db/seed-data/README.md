# Seed data

Reference data read by the sample-data seed (`scripts/seed.ts`, run by `npm run db:reset`). Nothing
in the app reads these files: the app uses the `zip_centroids` and `pilot_zips` tables, which
admins can change. Phoenix is only the sample data's pilot region.

## `pilot-region.json`

36 ZIP code areas in Arizona, all in the `America/Phoenix` time zone:

* 35 enabled pilot ZIPs labelled "Phoenix metro": Phoenix (9), Tempe (4), Scottsdale (4),
  Mesa (4), Chandler (3), Gilbert (3), Glendale (4), Peoria (3), and Maricopa 85138, which
  is far from every sample mechanic so a request there honestly matches nobody;
* Flagstaff 86001, stored as a ZIP centroid but **not** a pilot ZIP, for the "not in the
  pilot area" message.

Coordinates come from the **U.S. Census Bureau 2020 Census Gazetteer Files, ZIP Code
Tabulation Areas** (`2020_Gaz_zcta_national.txt`, downloaded on 2026-10-02 from
<https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip>).
Only the rows for these 36 ZCTAs were copied, unchanged:

| JSON field | Census column | Meaning |
| --- | --- | --- |
| `zip` | `GEOID` | ZCTA code |
| `lat`, `lng` | `INTPTLAT`, `INTPTLONG` | the ZCTA's internal point, used as an approximate centroid |
| `landAreaSqMi` | `ALAND_SQMI` | land area (kept for reference only) |

The Gazetteer is a work of the U.S. Government and is in the public domain. ZCTAs
approximate USPS ZIP Code areas but are not identical to them, and an internal point is not
an address: matching distances measured between these points are approximate, which the
app says wherever it shows a distance. City names are the USPS default city of each ZIP and
were added by hand (they are not in the Census file).

To add ZIPs, copy their rows from the national file the same way and give each a city; the
seed validates the file and fails if a value is missing or out of range.
