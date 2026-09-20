// Scenario runs. A recompute creates a new version; earlier versions are kept
// so a comparison can show what a changed assumption actually moved.
import type { Assessment, ProjectBrief } from "./evaluate";

export type Run = {
  version: number;
  at: string;
  siteId: string;
  label: string;
  brief: ProjectBrief;
  assessment: Assessment;
};

export type Delta = {
  criterionId: string;
  label: string;
  from: string;
  to: string;
  fromObserved: string;
  toObserved: string;
};

/** Human description of what changed between two briefs. */
export function describeChange(prev: ProjectBrief, next: ProjectBrief): string {
  const fields: Array<[keyof ProjectBrief, string, (v: unknown) => string]> = [
    ["mode", "mode", (v) => String(v)],
    ["itMW", "IT load", (v) => `${v} MW`],
    ["pue", "PUE", (v) => String(v)],
    ["utilization", "utilisation", (v) => `${Math.round(Number(v) * 100)}%`],
    ["wueLitresPerITkWh", "WUE", (v) => `${v} L/kWh`],
    ["tariffINRPerKWh", "tariff", (v) => `₹${v}/kWh`],
    ["requiredHectares", "land", (v) => `${v} ha`],
    ["openingDate", "opening", (v) => String(v)],
    ["maxLatencyMs", "latency", (v) => `${v} ms`],
    ["waterCapLDay", "water cap", (v) => (v === null ? "not supplied" : `${Number(v).toLocaleString("en-IN")} L/day`)],
  ];
  const changed = fields
    .filter(([k]) => prev[k] !== next[k])
    .map(([k, label, fmt]) => `${label} ${fmt(prev[k])} → ${fmt(next[k])}`);

  if (!changed.length) return "evidence updated";
  return changed.slice(0, 2).join(", ") + (changed.length > 2 ? ` +${changed.length - 2} more` : "");
}

/** Criteria whose verdict moved between two assessments. */
export function diff(prev: Assessment, next: Assessment): Delta[] {
  const out: Delta[] = [];
  for (const c of next.criteria) {
    const before = prev.criteria.find((x) => x.id === c.id);
    if (!before) continue;
    if (before.state !== c.state || before.observed !== c.observed) {
      out.push({
        criterionId: c.id,
        label: c.label,
        from: before.state,
        to: c.state,
        fromObserved: before.observed,
        toObserved: c.observed,
      });
    }
  }
  return out;
}

/** Appends a run, keeping history immutable and bounded. */
export function appendRun(history: Run[], run: Omit<Run, "version">, limit = 12): Run[] {
  const version = (history[history.length - 1]?.version ?? 0) + 1;
  return [...history, { ...run, version }].slice(-limit);
}
