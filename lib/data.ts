// Server-side dataset registry. Every record carries provenance; nothing is invented here.
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "data");
const cache = new Map<string, unknown>();

function load<T>(file: string): T {
  if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")));
  return cache.get(file) as T;
}

export type ClimateRecord = {
  id: string;
  kind: string;
  sourceFile: string;
  coordinates: [number, number, number];
  period: string;
  monthlyTemperatureC: Record<string, number>;
  monthlyRelativeHumidityPercent: Record<string, number>;
};

export type Facility = {
  id: number;
  name: string;
  city: string;
  lon: number;
  lat: number;
  sourceUrl: string;
};

export const climate = () => load<ClimateRecord[]>("climate-normalized.json");

export const demoSites = () =>
  load<{ sites: Array<Record<string, unknown>>; project: Record<string, number | string> }>("demo-sites.json");

export function facilities(): Facility[] {
  const fc = load<{ features: Array<{ geometry: { coordinates: [number, number] }; properties: Record<string, unknown> }> }>(
    "peeringdb-india-context.geojson"
  );
  return fc.features.map((f) => ({
    id: Number(f.properties.id),
    name: String(f.properties.name),
    city: String(f.properties.city),
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    sourceUrl: String(f.properties.sourceUrl),
  }));
}

/** Labelled synthetic documents a presenter can ingest. The store is not the project: nothing here counts until ingested. */
export function evidenceFixtures() {
  const read = (f: string) => fs.readFileSync(path.join(DIR, f), "utf8");
  return [
    { id: "demo-broker-A", title: "Broker brief", siteId: "A", origin: "fixture" as const, text: read("sample-broker-brief.txt"), summary: "Claims 30 MW by June 2027" },
    { id: "demo-utility-A", title: "Utility note", siteId: "A", origin: "fixture" as const, text: read("sample-utility-note.txt"), summary: "12 MW conditional, earliest Dec 2027" },
    { id: "demo-adversarial-A", title: "Seller note", siteId: "A", origin: "fixture" as const, text: read("sample-adversarial-note.txt"), summary: "Contains instruction-like text" },
  ];
}

// --- OpenStreetMap power context (Overpass extract, ODbL) -------------------

export type PowerFeature =
  | { kind: "substation"; osmId: string; name: string | null; kV: number | null; operator: string | null; lon: number; lat: number }
  | { kind: "line"; osmId: string; kV: number | null; coordinates: [number, number][] };

type PowerFC = {
  metadata: { retrievedAt: string; osmBase: string; caveat: string; query: string };
  features: Array<{ geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }>;
};

export const powerMetadata = () => load<PowerFC>("osm-power-context.geojson").metadata;

export function powerFeatures(): PowerFeature[] {
  const fc = load<PowerFC>("osm-power-context.geojson");
  return fc.features.map((f) => {
    const p = f.properties;
    if (p.kind === "substation") {
      const [lon, lat] = f.geometry.coordinates as [number, number];
      return { kind: "substation", osmId: String(p.osmId), name: (p.name as string | null) ?? null, kV: (p.kV as number | null) ?? null, operator: (p.operator as string | null) ?? null, lon, lat };
    }
    return { kind: "line", osmId: String(p.osmId), kV: (p.kV as number | null) ?? null, coordinates: f.geometry.coordinates as [number, number][] };
  });
}

/** Nearest tagged substation and the high-voltage lines passing within a radius. Presence only; never capacity. */
export function powerContext(centroid: [number, number], radiusKm = 15) {
  let nearest: { s: Extract<PowerFeature, { kind: "substation" }>; km: number } | null = null;
  const substationsWithin: Array<{ name: string | null; kV: number | null; km: number; osmId: string }> = [];
  const lineKV = new Map<string, number>();
  let linesWithin = 0;
  for (const f of powerFeatures()) {
    if (f.kind === "substation") {
      const km = distanceKm(centroid, [f.lon, f.lat]);
      if (!nearest || km < nearest.km) nearest = { s: f, km };
      if (km <= radiusKm) substationsWithin.push({ name: f.name, kV: f.kV, km: Number(km.toFixed(1)), osmId: f.osmId });
    } else {
      // Sample vertices; a line whose any vertex falls inside the radius counts as passing nearby.
      let near = false;
      for (let i = 0; i < f.coordinates.length; i += Math.max(1, Math.floor(f.coordinates.length / 40))) {
        if (distanceKm(centroid, f.coordinates[i]) <= radiusKm) { near = true; break; }
      }
      if (near) {
        linesWithin += 1;
        const k = f.kV === null ? "untagged" : `${f.kV} kV`;
        lineKV.set(k, (lineKV.get(k) ?? 0) + 1);
      }
    }
  }
  substationsWithin.sort((a, b) => a.km - b.km);
  return {
    nearestSubstation: nearest && nearest.km <= 60
      ? { name: nearest.s.name, kV: nearest.s.kV, operator: nearest.s.operator, km: Number(nearest.km.toFixed(1)), osmId: nearest.s.osmId, lon: nearest.s.lon, lat: nearest.s.lat }
      : null,
    substationsWithinRadius: substationsWithin.slice(0, 8),
    linesWithinRadius: linesWithin,
    lineVoltages: Object.fromEntries(Array.from(lineKV.entries()).sort((a, b) => b[1] - a[1])),
    radiusKm,
    inCoverage: Boolean(nearest && nearest.km <= 60),
  };
}

/** Haversine great-circle distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestFacility(centroid: [number, number]) {
  let best: { facility: Facility; km: number } | null = null;
  for (const f of facilities()) {
    const km = distanceKm(centroid, [f.lon, f.lat]);
    if (!best || km < best.km) best = { facility: f, km };
  }
  return best;
}

export function nearestClimate(centroid: [number, number]) {
  let best: { record: ClimateRecord; km: number } | null = null;
  for (const r of climate()) {
    const km = distanceKm(centroid, [r.coordinates[0], r.coordinates[1]]);
    if (!best || km < best.km) best = { record: r, km };
  }
  return best!;
}

export const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

export function peakTemp(r: ClimateRecord): { month: string; value: number } {
  let m = MONTHS[0];
  for (const k of MONTHS) if (r.monthlyTemperatureC[k] > r.monthlyTemperatureC[m]) m = k;
  return { month: m, value: r.monthlyTemperatureC[m] };
}

export const SOURCES = [
  { id: "S-NASA", name: "NASA POWER monthly climatology 2001–2020", url: "https://power.larc.nasa.gov/", scale: "~0.5° grid cell", kind: "recorded-public-data" },
  { id: "S-PDB", name: "PeeringDB India facilities", url: "https://www.peeringdb.com/", scale: "point facility records", kind: "recorded-public-data" },
  { id: "S-OSM", name: "OpenStreetMap power infrastructure (Overpass extract)", url: "https://www.openstreetmap.org/copyright", scale: "tagged substations and lines within 45 km of six anchors", kind: "recorded-public-data" },
  { id: "S-GB", name: "geoBoundaries India ADM1", url: "https://www.geoboundaries.org/", scale: "state boundaries", kind: "recorded-public-data" },
  { id: "S-CARTO", name: "CARTO dark basemap / OpenStreetMap", url: "https://carto.com/basemaps/", scale: "vector tiles", kind: "basemap" },
  { id: "S-FIX", name: "Demonstration parcels and documents", url: "", scale: "fictional", kind: "synthetic" },
];

/** Bounding box of the India ADM1 boundary set, used for the national camera. */
export function indiaBounds(): [number, number, number, number] {
  const fc = load<{ features: Array<{ geometry: { type: string; coordinates: unknown } }> }>("india-adm1.geojson");
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      const [x, y] = c as [number, number];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    if (Array.isArray(c)) for (const p of c) visit(p);
  };
  for (const f of fc.features) visit(f.geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

const titleCase = (id: string) =>
  id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export type Bookmark = {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  /** Set when a prepared parcel anchors this region, so the camera frames it. */
  parcelId: string | null;
};

/**
 * Regional anchors are derived from the prepared climate samples rather than a
 * hand-written list, so adding a dataset adds its bookmark. Where a demonstration
 * parcel sits near an anchor, the camera frames the parcel instead of the city.
 */
export function regionBookmarks(): Bookmark[] {
  const sites = demoSites().sites as Array<{ id: string; geometry: { coordinates: number[][][] } }>;

  const centroidOf = (ring: number[][]) => {
    const pts = ring.slice(0, -1);
    const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return [lon, lat] as [number, number];
  };

  return climate()
    .map((r) => {
      const anchor: [number, number] = [r.coordinates[0], r.coordinates[1]];
      let best: { id: string; centroid: [number, number]; km: number } | null = null;
      for (const s of sites) {
        const c = centroidOf(s.geometry.coordinates[0]);
        const km = distanceKm(anchor, c);
        if (km < 100 && (!best || km < best.km)) best = { id: s.id, centroid: c, km };
      }
      return {
        id: r.id,
        name: titleCase(r.id),
        center: best ? best.centroid : anchor,
        zoom: best ? 12 : 10,
        parcelId: best ? best.id : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
