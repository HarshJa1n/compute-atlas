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

export function evidenceDocs() {
  const read = (f: string) => fs.readFileSync(path.join(DIR, f), "utf8");
  return [
    { id: "demo-broker-A", title: "Broker brief (synthetic)", siteId: "A", text: read("sample-broker-brief.txt") },
    { id: "demo-utility-A", title: "Utility note (synthetic)", siteId: "A", text: read("sample-utility-note.txt") },
  ];
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
