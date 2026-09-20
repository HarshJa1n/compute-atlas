// Deterministic screening. Ported from the Build Day reference `evaluate.mjs`
// and extended to the PRD criteria set. The model may NOT override these results.
export const CALCULATION_VERSION = "atlas-2";

export type CriterionState = "pass" | "fail" | "unknown" | "conflict";

export type ProjectBrief = {
  mode: "campus" | "modular";
  itMW: number;
  pue: number;
  utilization: number;
  wueLitresPerITkWh: number;
  tariffINRPerKWh: number;
  waterCapLDay: number | null;
  requiredHectares: number;
  openingDate: string; // ISO yyyy-mm-dd
  maxLatencyMs: number;
};

export type SiteInput = {
  id: string;
  name: string;
  kind: string;
  areaHectares: number | null;
  availableMW: number | null;
  availableFromDate?: string | null;
  waterCapLDay: number | null;
  nearestFacilityKm?: number | null;
  peakTempC?: number | null;
  powerConflict?: { claim: string; counterClaim: string } | false;
};

export type Quantities = {
  averageFacilityMW: number;
  fullLoadFacilityMW: number;
  annualMWh: number;
  annualEnergyINR: number;
  waterLDay: number;
};

export type Criterion = {
  id: string;
  label: string;
  state: CriterionState;
  required: string;
  observed: string;
  basis: string;
};

export type Assessment = {
  calculationVersion: string;
  siteId: string;
  siteKind: string;
  quantities: Quantities;
  criteria: Criterion[];
  status: "passes-modelled-criteria-only" | "fails-supplied-requirement" | "needs-investigation";
  unknownCount: number;
  notice: string;
  createdAt: string;
};

function num(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Invalid ${name}`);
  return v;
}

export function quantities(p: ProjectBrief): Quantities {
  num(p.itMW, "itMW");
  num(p.pue, "pue");
  num(p.utilization, "utilization");
  num(p.wueLitresPerITkWh, "wueLitresPerITkWh");
  num(p.tariffINRPerKWh, "tariffINRPerKWh");
  if (p.itMW <= 0 || p.pue < 1 || p.utilization < 0 || p.utilization > 1 || p.wueLitresPerITkWh < 0 || p.tariffINRPerKWh < 0) {
    throw new Error("Out-of-range assumptions");
  }
  const averageFacilityMW = p.itMW * p.utilization * p.pue;
  const annualMWh = averageFacilityMW * 8760;
  return {
    averageFacilityMW,
    fullLoadFacilityMW: p.itMW * p.pue,
    annualMWh,
    annualEnergyINR: annualMWh * 1000 * p.tariffINRPerKWh,
    waterLDay: p.itMW * p.utilization * 24000 * p.wueLitresPerITkWh,
  };
}

/** Core rule: absent data is `unknown`, never a pass. A contradiction is `conflict`, never a silent pick. */
export function capacityCriterion(
  required: number,
  available: number | null | undefined,
  opts: { conflict?: boolean } = {}
): CriterionState {
  if (typeof required !== "number" || !Number.isFinite(required) || required < 0) throw new Error("Invalid requirement");
  if (opts.conflict) return "conflict";
  if (available === null || available === undefined) return "unknown";
  if (typeof available !== "number" || !Number.isFinite(available) || available < 0) throw new Error("Invalid capacity");
  return available >= required ? "pass" : "fail";
}

const fmt = (n: number, d = 1) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });

export function evaluate(p: ProjectBrief, site: SiteInput): Assessment {
  const q = quantities(p);
  const criteria: Criterion[] = [];

  criteria.push({
    id: "power",
    label: "Grid capacity at full load",
    state: capacityCriterion(q.fullLoadFacilityMW, site.availableMW, { conflict: Boolean(site.powerConflict) }),
    required: `${fmt(q.fullLoadFacilityMW)} MW`,
    observed: site.powerConflict
      ? "two sources disagree"
      : site.availableMW === null || site.availableMW === undefined
      ? "no sourced figure"
      : `${fmt(site.availableMW)} MW`,
    basis: "itMW x PUE. Utilization is excluded deliberately: the connection must carry full load.",
  });

  criteria.push({
    id: "water",
    label: "Water withdrawal per day",
    state: capacityCriterion(q.waterLDay, site.waterCapLDay ?? p.waterCapLDay),
    required: `${fmt(q.waterLDay, 0)} L/day`,
    observed:
      (site.waterCapLDay ?? p.waterCapLDay) === null
        ? "no sourced figure"
        : `${fmt((site.waterCapLDay ?? p.waterCapLDay)!, 0)} L/day`,
    basis: "itMW x utilization x 24000 kWh/day/MW x WUE.",
  });

  criteria.push({
    id: "land",
    label: "Usable land area",
    state: capacityCriterion(p.requiredHectares, site.areaHectares),
    required: `${fmt(p.requiredHectares, 2)} ha`,
    observed: site.areaHectares === null ? "geometry not set" : `${fmt(site.areaHectares, 2)} ha`,
    basis: "Polygon area via spherical excess (Turf). Gross area, not net buildable.",
  });

  // Schedule: an available-from date later than the opening date is a supplied-requirement failure.
  let scheduleState: CriterionState = "unknown";
  let observedDate = "no sourced connection date";
  if (site.availableFromDate) {
    observedDate = site.availableFromDate;
    scheduleState = new Date(site.availableFromDate) <= new Date(p.openingDate) ? "pass" : "fail";
  }
  criteria.push({
    id: "schedule",
    label: "Energisation before opening",
    state: scheduleState,
    required: `on or before ${p.openingDate}`,
    observed: observedDate,
    basis: "Date comparison only. A stated date is not a binding commitment.",
  });

  criteria.push({
    id: "connectivity",
    label: "Carrier facility proximity",
    state:
      site.nearestFacilityKm === null || site.nearestFacilityKm === undefined
        ? "unknown"
        : site.nearestFacilityKm <= 60
        ? "pass"
        : "fail",
    required: "a PeeringDB facility within 60 km",
    observed:
      site.nearestFacilityKm === null || site.nearestFacilityKm === undefined
        ? "not computed"
        : `${fmt(site.nearestFacilityKm)} km`,
    basis: "Great-circle distance to the nearest PeeringDB facility. Proximity is not latency or available fibre.",
  });

  if (typeof site.peakTempC === "number") {
    criteria.push({
      id: "climate",
      label: "Peak monthly dry-bulb",
      state: site.peakTempC <= 35 ? "pass" : "fail",
      required: "<= 35 C monthly mean",
      observed: `${fmt(site.peakTempC)} C`,
      basis: "NASA POWER 2001-2020 monthly climatology. A monthly mean is not a design day.",
    });
  }

  const states = criteria.map((c) => c.state);
  const status = states.includes("fail")
    ? "fails-supplied-requirement"
    : states.some((s) => s === "unknown" || s === "conflict")
    ? "needs-investigation"
    : "passes-modelled-criteria-only";

  return {
    calculationVersion: CALCULATION_VERSION,
    siteId: site.id,
    siteKind: site.kind,
    quantities: q,
    criteria,
    status,
    unknownCount: states.filter((s) => s === "unknown" || s === "conflict").length,
    notice: "Screening only. No ownership, permitting, utility commitment or power-flow certification is implied.",
    createdAt: new Date().toISOString(),
  };
}

export const PRESETS: Record<"campus" | "modular", ProjectBrief> = {
  campus: {
    mode: "campus",
    itMW: 20,
    pue: 1.3,
    utilization: 0.8,
    wueLitresPerITkWh: 0.5,
    tariffINRPerKWh: 7,
    waterCapLDay: null,
    requiredHectares: 6,
    openingDate: "2027-06-30",
    maxLatencyMs: 25,
  },
  modular: {
    mode: "modular",
    itMW: 5,
    pue: 1.18,
    utilization: 0.85,
    wueLitresPerITkWh: 0.05,
    tariffINRPerKWh: 7,
    waterCapLDay: null,
    requiredHectares: 1.2,
    openingDate: "2026-12-31",
    maxLatencyMs: 40,
  },
};
