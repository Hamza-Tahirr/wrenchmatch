// Marker ids shared by server-rendered tables and the client map islands (plain functions:
// Server Components can't call functions exported from a "use client" module).

/** The coverage map's marker id for a pilot ZIP (also the table row's data-map-id). */
export function zipPointId(zip: string): string {
  return `zip-${zip}`;
}
