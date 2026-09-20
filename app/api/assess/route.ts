import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluate } from "@/lib/analysis/evaluate";
import { nearestClimate, nearestFacility, peakTemp } from "@/lib/data";

export const runtime = "nodejs";

const Brief = z.object({
  mode: z.enum(["campus", "modular"]),
  itMW: z.number().positive(),
  pue: z.number().min(1),
  utilization: z.number().min(0).max(1),
  wueLitresPerITkWh: z.number().min(0),
  tariffINRPerKWh: z.number().min(0),
  waterCapLDay: z.number().nullable(),
  requiredHectares: z.number().positive(),
  openingDate: z.string(),
  maxLatencyMs: z.number().positive(),
});

const Site = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  areaHectares: z.number().nullable(),
  availableMW: z.number().nullable(),
  availableFromDate: z.string().nullable().optional(),
  waterCapLDay: z.number().nullable(),
  powerConflict: z.union([z.object({ claim: z.string(), counterClaim: z.string() }), z.literal(false)]).optional(),
});

const Body = z.object({
  brief: Brief,
  site: Site,
  centroid: z.tuple([z.number(), z.number()]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { brief, site, centroid } = parsed.data;

  // Server derives the geographic observations; the client cannot assert them.
  const fac = nearestFacility(centroid);
  const clim = nearestClimate(centroid);
  const pk = peakTemp(clim.record);

  const assessment = evaluate(brief, {
    ...site,
    nearestFacilityKm: fac ? Number(fac.km.toFixed(1)) : null,
    peakTempC: clim.km < 400 ? pk.value : null,
  });

  return NextResponse.json({
    assessment,
    context: {
      nearestFacility: fac ? { name: fac.facility.name, city: fac.facility.city, km: Number(fac.km.toFixed(1)), url: fac.facility.sourceUrl } : null,
      climate: {
        station: clim.record.id,
        km: Number(clim.km.toFixed(1)),
        period: clim.record.period,
        peakMonth: pk.month,
        inCoverage: clim.km < 400,
        monthly: clim.record.monthlyTemperatureC,
        humidity: clim.record.monthlyRelativeHumidityPercent,
      },
    },
  });
}
