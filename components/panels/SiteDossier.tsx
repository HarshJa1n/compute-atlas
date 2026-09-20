"use client";

import { Section, StateChip, Stat, SyntheticBadge } from "./ui";
import type { Assessment } from "@/lib/analysis/evaluate";
import { nextChecks } from "@/lib/analysis/checks";

export type AssessContext = {
  nearestFacility: { name: string; city: string; km: number; url: string } | null;
  climate: {
    station: string; km: number; period: string; peakMonth: string;
    inCoverage: boolean; monthly: Record<string, number>; humidity: Record<string, number>;
  };
};

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const inr = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(2)} cr` : `${(n / 1e5).toFixed(1)} L`);

function ClimateStrip({ monthly, peak }: { monthly: Record<string, number>; peak: string }) {
  const vals = MONTHS.map((m) => monthly[m]);
  const lo = Math.min(...vals) - 2;
  const hi = Math.max(...vals) + 2;
  return (
    <div>
      <div className="flex h-16 items-end gap-[3px]" role="img" aria-label={`Monthly mean temperature, peak in ${peak}`}>
        {MONTHS.map((m) => {
          const v = monthly[m];
          const h = ((v - lo) / (hi - lo)) * 100;
          const hot = v > 35;
          return (
            <div key={m} className="group relative flex-1">
              <div
                className={`w-full rounded-t-[2px] transition-all ${hot ? "bg-danger/70" : m === peak ? "bg-caution/70" : "bg-info/35"}`}
                style={{ height: `${Math.max(h, 4)}%` }}
              />
              <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-bg px-1 text-[9px] tabular text-ink ring-1 ring-white/10 group-hover:block">
                {v.toFixed(1)}°
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] uppercase text-muted/70">
        <span>Jan</span><span>Jun</span><span>Dec</span>
      </div>
    </div>
  );
}

export default function SiteDossier({
  name, kind, areaHa, assessment, context, onInvestigate, onCompare, busy,
}: {
  name: string;
  kind: string;
  areaHa: number | null;
  assessment: Assessment | null;
  context: AssessContext | null;
  onInvestigate: () => void;
  onCompare: () => void;
  busy: boolean;
}) {
  if (!assessment) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-sm font-medium text-ink">No site selected</div>
        <p className="max-w-[240px] text-xs leading-relaxed text-muted">
          Pick a demonstration parcel, or draw a polygon anywhere in India. Drawing outside prepared coverage still
          returns a report — most criteria will read <span className="text-caution">unknown</span>.
        </p>
      </div>
    );
  }

  const q = assessment.quantities;
  const statusCopy: Record<Assessment["status"], { t: string; c: string }> = {
    "passes-modelled-criteria-only": { t: "Passes modelled criteria only", c: "text-active" },
    "fails-supplied-requirement": { t: "Fails a supplied requirement", c: "text-danger" },
    "needs-investigation": { t: "Needs investigation", c: "text-caution" },
  };
  const s = statusCopy[assessment.status];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[15px] font-semibold leading-snug text-ink">{name}</h2>
          {kind === "synthetic" && <SyntheticBadge />}
        </div>
        <div className={`mt-1.5 text-[13px] font-semibold ${s.c}`}>{s.t}</div>
        <div className="mt-0.5 text-[11px] text-muted">
          {assessment.unknownCount > 0
            ? `${assessment.unknownCount} criteria unresolved · calc ${assessment.calculationVersion}`
            : `calc ${assessment.calculationVersion}`}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onInvestigate}
            disabled={busy}
            className="flex-1 rounded-control bg-active px-3 py-2 text-[12px] font-semibold text-bg transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Investigating…" : "Investigate"}
          </button>
          <button
            onClick={onCompare}
            className="rounded-control px-3 py-2 text-[12px] font-semibold text-ink ring-1 ring-white/10 transition hover:bg-white/5"
          >
            Compare
          </button>
        </div>
      </div>

      <Section title="Derived demand">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Full-load facility" value={q.fullLoadFacilityMW.toFixed(1)} unit="MW" hint="IT × PUE" />
          <Stat label="Average facility" value={q.averageFacilityMW.toFixed(1)} unit="MW" hint="× utilisation" />
          <Stat label="Annual energy" value={Math.round(q.annualMWh).toLocaleString("en-IN")} unit="MWh" />
          <Stat label="Energy cost/yr" value={`₹${inr(q.annualEnergyINR)}`} hint="at supplied tariff" />
          <Stat label="Water draw" value={Math.round(q.waterLDay).toLocaleString("en-IN")} unit="L/day" />
          <Stat label="Usable land" value={areaHa === null ? "—" : areaHa.toFixed(2)} unit="ha" hint="gross, not net" />
        </div>
      </Section>

      <Section title="Criteria">
        <ul className="space-y-1.5">
          {assessment.criteria.map((c) => (
            <li key={c.id} className="rounded-control bg-white/[.02] p-2.5 ring-1 ring-white/[.04]">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink">{c.label}</span>
                <StateChip state={c.state} />
              </div>
              <div className="tabular mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                <span className="text-muted">needs <span className="text-ink">{c.required}</span></span>
                <span className="text-muted">have <span className="text-ink">{c.observed}</span></span>
              </div>
              <p className="mt-1 text-[10.5px] leading-snug text-muted/75">{c.basis}</p>
            </li>
          ))}
        </ul>
      </Section>

      {context && (
        <Section title="Geographic context">
          {context.climate.inCoverage ? (
            <>
              <ClimateStrip monthly={context.climate.monthly} peak={context.climate.peakMonth} />
              <p className="mt-2 text-[10.5px] leading-snug text-muted">
                NASA POWER cell near <span className="text-ink capitalize">{context.climate.station}</span> ({context.climate.km} km away).
                Peak monthly mean in {context.climate.peakMonth}. Monthly means are not design-day values.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-caution">
              No prepared climate sample within 400 km. Climate reads unknown rather than interpolated.
            </p>
          )}
          {context.nearestFacility && (
            <p className="mt-2.5 border-t hairline border-t pt-2.5 text-[10.5px] leading-snug text-muted">
              Nearest carrier facility{" "}
              <a href={context.nearestFacility.url} target="_blank" rel="noreferrer" className="text-info underline decoration-info/40 underline-offset-2">
                {context.nearestFacility.name}
              </a>{" "}
              · {context.nearestFacility.km} km. Proximity is not available fibre.
            </p>
          )}
        </Section>
      )}

      {(() => {
        const checks = nextChecks(assessment);
        if (!checks.length) return null;
        return (
          <Section title="Next investigations" right={<span className="text-[10px] text-muted">{checks.length} open</span>}>
            <ol className="space-y-1.5">
              {checks.map((c, i) => (
                <li key={c.criterionId} className="rounded-control bg-white/[.02] p-2.5 ring-1 ring-white/[.04]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12.5px] font-medium text-ink">
                      <span className="tabular mr-1.5 text-muted">{i + 1}.</span>
                      {c.criterion}
                    </span>
                    <StateChip state={c.state} />
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted">{c.why}</p>
                  <p className="mt-1 text-[11px] leading-snug text-ink/85">
                    <span className="text-muted">Obtain: </span>{c.evidence}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-muted/80">Owner: {c.owner}</p>
                </li>
              ))}
            </ol>
          </Section>
        );
      })()}

      <Section title="Boundaries">
        <p className="text-[10.5px] leading-relaxed text-muted/85">{assessment.notice}</p>
      </Section>
    </div>
  );
}
