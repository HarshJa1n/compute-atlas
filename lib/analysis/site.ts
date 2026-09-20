// Server-side assembly of everything the evaluator needs for one site.
// The client sends a centroid, an area and the documents it has ingested; the
// server derives geography and evidence facts so the browser cannot assert them.
import * as turf from "@turf/turf";
import type { Polygon } from "geojson";
import { deriveSiteFacts, extractClaims, type Claim, type EvidenceDoc } from "@/lib/analysis/evidence";
import type { SiteInput } from "@/lib/analysis/evaluate";
import { demoSites, nearestClimate, nearestFacility, peakTemp, powerContext } from "@/lib/data";

export type ClientSite = {
  id: string;
  name: string;
  kind: string;
  areaHectares: number | null;
  availableMW: number | null;
  waterCapLDay: number | null;
};

export type GeoContext = {
  nearestFacility: { name: string; city: string; km: number; url: string; lon: number; lat: number } | null;
  climate: {
    station: string; km: number; period: string; peakMonth: string; inCoverage: boolean;
    monthly: Record<string, number>; humidity: Record<string, number>; lon: number; lat: number;
  };
  power: ReturnType<typeof powerContext>;
};

export function geoContext(centroid: [number, number]): GeoContext {
  const fac = nearestFacility(centroid);
  const clim = nearestClimate(centroid);
  const pk = peakTemp(clim.record);
  return {
    nearestFacility: fac
      ? { name: fac.facility.name, city: fac.facility.city, km: Number(fac.km.toFixed(1)), url: fac.facility.sourceUrl, lon: fac.facility.lon, lat: fac.facility.lat }
      : null,
    climate: {
      station: clim.record.id,
      km: Number(clim.km.toFixed(1)),
      period: clim.record.period,
      peakMonth: pk.month,
      inCoverage: clim.km < 400,
      monthly: clim.record.monthlyTemperatureC,
      humidity: clim.record.monthlyRelativeHumidityPercent,
      lon: clim.record.coordinates[0],
      lat: clim.record.coordinates[1],
    },
    power: powerContext(centroid),
  };
}

export function buildSiteInput(site: ClientSite, centroid: [number, number], evidence: EvidenceDoc[]): { input: SiteInput; context: GeoContext; claims: Claim[] } {
  const context = geoContext(centroid);
  const docs = evidence.filter((d) => d.siteId === site.id);
  const claims = docs.flatMap(extractClaims);
  const facts = deriveSiteFacts(
    { availableMW: site.availableMW, waterCapLDay: site.waterCapLDay, label: site.kind === "synthetic" ? "Fixture sheet" : "Site record" },
    claims
  );
  const input: SiteInput = {
    id: site.id,
    name: site.name,
    kind: site.kind,
    areaHectares: site.areaHectares,
    availableMW: facts.availableMW,
    availableFromDate: facts.availableFromDate,
    waterCapLDay: facts.waterCapLDay,
    powerConflict: facts.powerConflict,
    scheduleConflict: facts.scheduleConflict,
    sources: facts.sources,
    nearestFacilityKm: context.nearestFacility ? context.nearestFacility.km : null,
    peakTempC: context.climate.inCoverage ? context.climate.monthly[context.climate.peakMonth] : null,
  };
  return { input, context, claims };
}

/** A prepared demonstration parcel as the client would describe it, for server-side comparison. */
export function demoClientSite(id: string): { site: ClientSite; centroid: [number, number] } | null {
  const raw = demoSites().sites.find((s) => String(s.id) === id);
  if (!raw) return null;
  const geometry = raw.geometry as Polygon;
  const poly = turf.polygon(geometry.coordinates);
  return {
    site: {
      id: String(raw.id),
      name: String(raw.name),
      kind: String(raw.kind),
      areaHectares: turf.area(poly) / 10_000,
      availableMW: (raw.availableMW ?? null) as number | null,
      waterCapLDay: (raw.waterCapLDay ?? null) as number | null,
    },
    centroid: turf.centroid(poly).geometry.coordinates as [number, number],
  };
}
