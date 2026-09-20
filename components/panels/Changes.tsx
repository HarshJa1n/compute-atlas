"use client";

import type { Criterion, CriterionDelta, CriterionState, QuantityDelta, Quantities } from "@/lib/analysis/evaluate";
import { STATE_META } from "./ui";

export type Delta = { criteria: CriterionDelta[]; quantities: QuantityDelta[]; reason: string; at: number };

const Q_LABEL: Record<keyof Quantities, { label: string; unit: string; d: number; scale?: number }> = {
  fullLoadFacilityMW: { label: "Full load", unit: "MW", d: 1 },
  averageFacilityMW: { label: "Average", unit: "MW", d: 1 },
  annualMWh: { label: "Energy", unit: "MWh/yr", d: 0 },
  annualEnergyINR: { label: "Cost", unit: "cr/yr", d: 1, scale: 1e-7 },
  waterLDay: { label: "Water", unit: "L/day", d: 0 },
};

function StateWord({ s }: { s: CriterionState }) {
  const m = STATE_META[s];
  return <span className={`font-semibold ${m.text}`}>{m.label}</span>;
}

const fmtQ = (k: keyof Quantities, v: number) => {
  const m = Q_LABEL[k];
  return ((m.scale ?? 1) * v).toLocaleString("en-IN", { maximumFractionDigits: m.d });
};

/** What just changed and why. Shown once per change so the room sees the verdict move. */
export function DeltaCard({ delta, criteria, onDismiss }: { delta: Delta; criteria: Criterion[]; onDismiss: () => void }) {
  const shown = delta.quantities.filter((q) => q.key !== "averageFacilityMW" && q.key !== "annualMWh");
  return (
    <div className="mx-4 mb-1 mt-2 rounded-panel bg-brand/[.08] p-3 ring-1 ring-brand/30 animate-rise">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-brand">What changed</h3>
        <button onClick={onDismiss} className="text-[11px] text-muted hover:text-ink" aria-label="Dismiss change summary">Dismiss</button>
      </div>
      <p className="mb-1.5 text-[11px] text-muted">{delta.reason}</p>
      {delta.criteria.length > 0 && (
        <ul className="space-y-1.5">
          {delta.criteria.map((c) => {
            const now = criteria.find((x) => x.id === c.id);
            return (
              <li key={c.id} className="text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink">{c.label}</span>
                  <span className="whitespace-nowrap">
                    <StateWord s={c.from} /> <span className="text-muted">→</span> <StateWord s={c.to} />
                  </span>
                </div>
                {now?.disagreement ? (
                  <div className="tabular mt-0.5 text-[10.5px] leading-snug text-muted">
                    <span className="text-ink/90">{now.disagreement.claim}</span> <span>vs</span> <span className="text-ink/90">{now.disagreement.counterClaim}</span>
                  </div>
                ) : now ? (
                  <div className="tabular mt-0.5 text-[10.5px] leading-snug text-muted">needs {now.required} · have {now.observed}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > 0 && (
        <ul className={`${delta.criteria.length ? "mt-2 border-t border-brand/15 pt-2" : ""} grid grid-cols-3 gap-1.5`}>
          {shown.map((q) => (
            <li key={q.key} className="tabular text-[10.5px] text-muted">
              <span className="block text-[9.5px] uppercase tracking-wider">{Q_LABEL[q.key].label}</span>
              <span className="text-muted/70">{fmtQ(q.key, q.from)}</span> <span className="text-ink">→ {fmtQ(q.key, q.to)}</span>
              <span className="ml-0.5 text-[9px]">{Q_LABEL[q.key].unit}</span>
            </li>
          ))}
        </ul>
      )}
      {delta.criteria.length === 0 && shown.length === 0 && <p className="text-[11px] text-muted">Demand figures moved; no verdict crossed a threshold.</p>}
    </div>
  );
}

export type ScenarioResult = {
  label: string;
  changes: Record<string, unknown>;
  before: { status: string };
  after: { status: string };
  deltas: CriterionDelta[];
  quantityDeltas: QuantityDelta[];
};

const CHANGE_LABEL: Record<string, string> = {
  itMW: "IT load", pue: "PUE", utilization: "Utilisation", wueLitresPerITkWh: "WUE", waterCapLDay: "Water cap",
  requiredHectares: "Land needed", openingDate: "Opening", mode: "Mode",
};

/** A what-if the agent ran. The live assessment is untouched until the analyst applies it. */
export function ScenarioCard({ scenario, onApply, onDismiss }: { scenario: ScenarioResult; onApply: () => void; onDismiss: () => void }) {
  const changes = Object.entries(scenario.changes);
  return (
    <div className="mx-4 mb-1 mt-2 rounded-panel bg-conflict/[.07] p-3 ring-1 ring-conflict/30 animate-rise">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-conflict">Scenario tested by the agent</h3>
        <button onClick={onDismiss} className="text-[11px] text-muted hover:text-ink" aria-label="Dismiss scenario">Dismiss</button>
      </div>
      <p className="text-[12px] font-medium text-ink">{scenario.label}</p>
      <p className="tabular mt-0.5 text-[10.5px] text-muted">
        {changes.map(([k, v]) => `${CHANGE_LABEL[k] ?? k} → ${v === null ? "none" : String(v)}`).join(" · ")}
      </p>
      {scenario.deltas.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {scenario.deltas.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-ink">{c.label}</span>
              <span className="whitespace-nowrap"><StateWord s={c.from} /> <span className="text-muted">→</span> <StateWord s={c.to} /></span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-muted">No criterion changes state under this scenario.</p>
      )}
      {scenario.quantityDeltas.filter((q) => q.key !== "averageFacilityMW" && q.key !== "annualMWh").length > 0 && (
        <ul className="mt-2 grid grid-cols-3 gap-1.5 border-t border-conflict/15 pt-2">
          {scenario.quantityDeltas
            .filter((q) => q.key !== "averageFacilityMW" && q.key !== "annualMWh")
            .map((q) => (
              <li key={q.key} className="tabular text-[10.5px] text-muted">
                <span className="block text-[9.5px] uppercase tracking-wider">{Q_LABEL[q.key].label}</span>
                <span className="text-muted/70">{fmtQ(q.key, q.from)}</span> <span className="text-ink">→ {fmtQ(q.key, q.to)}</span>
                <span className="ml-0.5 text-[9px]">{Q_LABEL[q.key].unit}</span>
              </li>
            ))}
        </ul>
      )}
      <div className="mt-2.5 flex gap-2">
        <button onClick={onApply} className="rounded-control bg-brand px-3 py-1.5 text-[11px] font-semibold text-bg transition hover:brightness-110">
          Apply to brief
        </button>
        <span className="self-center text-[10px] text-muted/80">Live assessment unchanged until applied.</span>
      </div>
    </div>
  );
}
