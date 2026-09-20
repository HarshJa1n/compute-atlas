// Geometry validation for user-drawn and imported polygons (PRD AT-03).
import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";

export const MIN_HECTARES = 0.05;
export const MAX_HECTARES = 50_000; // 500 km²; beyond this it is a region, not a site

export type Validation = { ok: true; hectares: number } | { ok: false; reason: string };

export function validatePolygon(
  geometry: Polygon,
  bounds: [number, number, number, number]
): Validation {
  if (geometry?.type !== "Polygon" || !Array.isArray(geometry.coordinates?.[0])) {
    return { ok: false, reason: "Not a GeoJSON Polygon." };
  }
  const ring = geometry.coordinates[0];
  if (ring.length < 4) return { ok: false, reason: "A polygon needs at least three distinct corners." };

  for (const p of ring) {
    if (!Array.isArray(p) || typeof p[0] !== "number" || typeof p[1] !== "number" || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      return { ok: false, reason: "Coordinates must be finite [longitude, latitude] pairs." };
    }
    if (p[0] < -180 || p[0] > 180 || p[1] < -90 || p[1] > 90) {
      return { ok: false, reason: "Coordinates fall outside valid longitude/latitude ranges." };
    }
  }

  let feature: Feature<Polygon>;
  try {
    feature = turf.polygon(geometry.coordinates);
  } catch {
    return { ok: false, reason: "The ring does not close into a valid polygon." };
  }

  if (turf.kinks(feature).features.length > 0) {
    return { ok: false, reason: "The outline crosses itself. Redraw it without overlapping edges." };
  }

  const hectares = turf.area(feature) / 10_000;
  if (hectares < MIN_HECTARES) {
    return { ok: false, reason: `Too small to screen (${hectares.toFixed(3)} ha). Minimum is ${MIN_HECTARES} ha.` };
  }
  if (hectares > MAX_HECTARES) {
    return { ok: false, reason: `Too large to screen (${Math.round(hectares).toLocaleString("en-IN")} ha). Maximum is ${MAX_HECTARES.toLocaleString("en-IN")} ha.` };
  }

  // Outside prepared national coverage the screening has no geographic inputs at all.
  const [lon, lat] = turf.centroid(feature).geometry.coordinates;
  const [minX, minY, maxX, maxY] = bounds;
  if (lon < minX || lon > maxX || lat < minY || lat > maxY) {
    return { ok: false, reason: "Centre falls outside India. This build only screens Indian sites." };
  }

  return { ok: true, hectares };
}

/** Accepts a Polygon, Feature<Polygon> or single-feature FeatureCollection. */
export function parsePolygon(text: string): Polygon | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const obj = json as Record<string, unknown>;
  if (obj?.type === "Polygon") return obj as unknown as Polygon;
  if (obj?.type === "Feature") {
    const g = (obj.geometry as Polygon | undefined);
    return g?.type === "Polygon" ? g : null;
  }
  if (obj?.type === "FeatureCollection") {
    const fs = obj.features as Array<{ geometry?: Polygon }> | undefined;
    const hit = fs?.find((f) => f.geometry?.type === "Polygon");
    return hit?.geometry ?? null;
  }
  return null;
}
