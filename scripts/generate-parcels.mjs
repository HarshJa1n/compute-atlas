// Regenerates the demonstration parcels with irregular, land-like outlines.
// Deterministic: the same seed always produces the same parcels, so the demo
// is reproducible and the geometry can be regenerated after editing this file.
//
//   node scripts/generate-parcels.mjs
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../public/data/demo-sites.json", import.meta.url);

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R_EARTH = 6371000;
const metresPerDegLat = 111132;
const metresPerDegLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

/** Planar shoelace area in m², good enough at parcel scale. */
function areaM2(ring, lat0) {
  const mx = metresPerDegLon(lat0);
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    a += (x1 * mx) * (y2 * metresPerDegLat) - (x2 * mx) * (y1 * metresPerDegLat);
  }
  return Math.abs(a / 2);
}

/**
 * Builds a star-shaped polygon around a centre: vertices ordered by angle, so
 * the ring can never self-intersect. Radial noise gives irregular edges, and a
 * dominant bearing plus a run of near-collinear vertices imitates a parcel that
 * follows a road or field boundary rather than a bounding box.
 */
function parcel({ centre, targetHectares, seed, vertices = 11 }) {
  const rand = rng(seed);
  const [lon0, lat0] = centre;
  const bearing = rand() * Math.PI * 2;

  // A frontage: three consecutive vertices share a radius, reading as a straight edge.
  const flatStart = Math.floor(rand() * vertices);
  const flatRadius = 0.86 + rand() * 0.1;

  const angles = [];
  for (let i = 0; i < vertices; i++) {
    const even = (i / vertices) * Math.PI * 2;
    angles.push(even + (rand() - 0.5) * (Math.PI / vertices) * 0.9);
  }
  angles.sort((a, b) => a - b);

  let ring = angles.map((theta, i) => {
    const inFlat = i >= flatStart && i < flatStart + 3;
    const r = inFlat ? flatRadius : 0.72 + rand() * 0.52;
    // Slight anisotropy so parcels are not circular blobs.
    const stretch = 1 + 0.22 * Math.cos(2 * (theta - bearing));
    const dLat = (r * stretch * Math.cos(theta)) / metresPerDegLat;
    const dLon = (r * stretch * Math.sin(theta)) / metresPerDegLon(lat0);
    return [lon0 + dLon, lat0 + dLat];
  });

  // Scale to the requested area.
  ring.push(ring[0]);
  const target = targetHectares * 10_000;
  const scale = Math.sqrt(target / areaM2(ring.map(([x, y]) => [x, y]), lat0));
  ring = ring.map(([x, y]) => [
    Number((lon0 + (x - lon0) * scale).toFixed(6)),
    Number((lat0 + (y - lat0) * scale).toFixed(6)),
  ]);
  ring[ring.length - 1] = ring[0];
  return ring;
}

const SPECS = [
  { id: "A", centre: [77.5355, 23.1842], targetHectares: 88.4, seed: 10247, vertices: 12 },
  { id: "B", centre: [75.9852, 22.8041], targetHectares: 49.1, seed: 55291, vertices: 10 },
  // C is deliberately small: it fails the 6 ha campus requirement but fits a modular build.
  { id: "C", centre: [79.0251, 21.2039], targetHectares: 5.3, seed: 90813, vertices: 9 },
];

const data = JSON.parse(readFileSync(FILE, "utf8"));
for (const spec of SPECS) {
  const site = data.sites.find((s) => s.id === spec.id);
  if (!site) throw new Error(`No site ${spec.id} in demo-sites.json`);
  const ring = parcel(spec);
  site.geometry = { type: "Polygon", coordinates: [ring] };
  const ha = areaM2(ring, spec.centre[1]) / 10_000;
  console.log(`Parcel ${spec.id}: ${ring.length - 1} vertices, ${ha.toFixed(2)} ha`);
}
data.geometryVersion = 2;
writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
console.log("Wrote", FILE.pathname);
