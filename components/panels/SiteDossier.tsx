"use client";

import { Section, StateChip, Stat, SyntheticBadge } from "./ui";
import { DeltaCard, ScenarioCard, type Delta, type ScenarioResult } from "./Changes";
import type { Assessment } from "@/lib/analysis/evaluate";
import type { GeoContext } from "@/lib/analysis/site";
import { nextChecks } from "@/lib/analysis/checks";

export type AssessContext = GeoContext;

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const inr = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(2)} cr` : `${(n / 1e5).toFixed(1)} L`);

function ClimateStrip({ monthly, peak }: { monthly: Record<string, number>; peak: string }) {
  const vals = MONTHS.map((m) => monthly[m]);
  const lo = Math.min(...vals) - 2;
  const hi = Math.max(...vals) + 2;
  return (
    <div>
      <div className="flex h-14 items-end gap-[3px]" role="img" aria-label={`Monthly mean temperature, peak in ${peak}`}>
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
  name, kind, notice, areaHa, assessment, context, onInvestigate, onCompare, busy,
  changed, delta, onDismissDelta, scenario, onApplyScenario, onDismissScenario, onFocus,
}: {
  name: string;
  kind: string;
  notice?: string;
  areaHa: number | null;
  assessment: Assessment | null;
  context: AssessContext | null;
  onInvestigate: () => void;
  onCompare: () => void;
  busy: boolean;
  changed: Set<string>;
  delta: Delta | null;
  onDismissDelta: () => void;
  scenario: ScenarioResult | null;
  onApplyScenario: () => void;
  onDismissScenario: () => void;
  onFocus: (target: "facility" | "substation") => void;
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
    "passes-modelled-criteria-only": { t: "Passes modelled criteria", c: "text-active" },
    "fails-supplied-requirement": { t: "Fails a requirement", c: "text-danger" },
    "needs-investigation": { t: "Needs investigation", c: "text-caution" },
  };
  const s = statusCopy[assessment.status];
  const p = context?.power;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-4 pb-2.5 pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[14px] font-semibold leading-snug text-ink">{name}</h2>
          {kind === "synthetic" && <SyntheticBadge>Fixture</SyntheticBadge>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className={`truncate text-[12.5px] font-semibold ${s.c}`}>{s.t}</div>
            <div className="text-[10.5px] text-muted">
              {assessment.unknownCount > 0 ? `${assessment.unknownCount} unresolved · ` : ""}calc {assessment.calculationVersion}
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={onInvestigate}
              disabled={busy}
              className="rounded-control bg-brand px-3 py-1.5 text-[12px] font-semibold text-bg transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Investigating…" : "Investigate"}
            </button>
            <button onClick={onCompare} className="rounded-control px-2.5 py-1.5 text-[12px] font-semibold text-ink ring-1 ring-white/10 transition hover:bg-white/5">
              Compare
            </button>
          </div>
        </div>
      </div>

      {delta && <DeltaCard delta={delta} criteria={assessment.criteria} onDismiss={onDismissDelta} />}
      {scenario && <ScenarioCard scenario={scenario} onApply={onApplyScenario} onDismiss={onDismissScenario} />}

      <Section title="Criteria">
        <ul className="space-y-1.5">
          {assessment.criteria.map((c) => (
            <li
              key={c.id}
              className={`rounded-control bg-white/[.02] p-2.5 ring-1 ring-white/[.04] ${changed.has(c.id) ? "animate-flash" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink">{c.label}</span>
                <StateChip state={c.state} />
              </div>
              <div className="tabular mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                <span className="text-muted">needs <span className="text-ink">{c.required}</span></span>
                <span className="text-muted">have <span className="text-ink">{c.observed}</span></span>
              </div>
              {c.disagreement && (
                <div className="mt-1.5 space-y-0.5 rounded bg-info/[.07] px-2 py-1.5 text-[10.5px] leading-snug ring-1 ring-info/20">
                  <div className="text-ink">{c.disagreement.claim}</div>
                  <div className="text-muted">vs</div>
                  <div className="text-ink">{c.disagreement.counterClaim}</div>
                </div>
              )}
              {!c.disagreement && c.sources.length > 0 && (
                <p className="mt-1 text-[10px] text-info/80">from {c.sources.join(" · ")}</p>
              )}
              <p className="mt-1 text-[10.5px] leading-snug text-muted/75">{c.basis}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Derived demand">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Full load" value={q.fullLoadFacilityMW.toFixed(1)} unit="MW" hint="IT × PUE" />
          <Stat label="Water" value={Math.round(q.waterLDay).toLocaleString("en-IN")} unit="L/d" />
          <Stat label="Cost/yr" value={`₹${inr(q.annualEnergyINR)}`} hint="supplied tariff" />
        </div>
        <p className="tabular mt-2 text-[10.5px] text-muted/80">
          Average {q.averageFacilityMW.toFixed(1)} MW · {Math.round(q.annualMWh).toLocaleString("en-IN")} MWh/yr · {areaHa === null ? "—" : `${areaHa.toFixed(2)} ha`} gross land
        </p>
      </Section>

      {context && (
        <Section title="Geographic context">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted/70">Context is not commitment</p>
          {context.climate.inCoverage ? (
            <>
              <ClimateStrip monthly={context.climate.monthly} peak={context.climate.peakMonth} />
              <p className="mt-2 text-[10.5px] leading-snug text-muted">
                NASA POWER cell near <span className="text-ink capitalize">{context.climate.station}</span> ({context.climate.km} km). Peak monthly mean in {context.climate.peakMonth}.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-caution">No prepared climate sample within 400 km. Climate reads unknown rather than interpolated.</p>
          )}

          <div className="mt-2.5 border-t hairline border-t pt-2.5 text-[10.5px] leading-snug text-muted">
            {p?.inCoverage ? (
              <>
                Grid presence:{" "}
                {p.nearestSubstation ? (
                  <button onClick={() => onFocus("substation")} className="text-ink underline decoration-white/30 underline-offset-2 hover:text-ink">
                    {p.nearestSubstation.name ?? "unnamed substation"}{p.nearestSubstation.kV ? ` · ${p.nearestSubstation.kV} kV` : ""} · {p.nearestSubstation.km} km
                  </button>
                ) : (
                  "no tagged substation within 60 km"
                )}
                . {p.linesWithinRadius} tagged lines within {p.radiusKm} km
                {Object.keys(p.lineVoltages).length ? ` (${Object.entries(p.lineVoltages).slice(0, 3).map(([k, v]) => `${v} × ${k}`).join(", ")})` : ""}. OpenStreetMap; presence is not available capacity.
              </>
            ) : (
              <span className="text-caution">No prepared grid extract within 60 km. Grid context unknown.</span>
            )}
          </div>

          {context.nearestFacility && (
            <p className="mt-2 text-[10.5px] leading-snug text-muted">
              Nearest carrier facility{" "}
              <button onClick={() => onFocus("facility")} className="text-info underline decoration-info/40 underline-offset-2 hover:text-ink">
                {context.nearestFacility.name}
              </button>{" "}
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
                  <p className="mt-1 text-[11px] leading-snug text-ink/85"><span className="text-muted">Obtain: </span>{c.evidence}</p>
                  <p className="mt-0.5 text-[10.5px] text-muted/80">Owner: {c.owner}</p>
                </li>
              ))}
            </ol>
          </Section>
        );
      })()}

      <Section title="Boundaries">
        {notice && <p className="mb-1 text-[10.5px] leading-relaxed text-caution/90">{notice}.</p>}
        <p className="text-[10.5px] leading-relaxed text-muted/85">{assessment.notice}</p>
      </Section>
    </div>
  );
}
