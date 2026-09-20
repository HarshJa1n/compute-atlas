// Prioritised next investigations. Pure, so the dossier and the agent tool
// present exactly the same list rather than two different opinions.
import type { Assessment, CriterionState } from "./evaluate";

export type NextCheck = {
  criterion: string;
  criterionId: string;
  state: CriterionState;
  why: string;
  evidence: string;
  owner: string;
};

const NEEDS: Record<string, { evidence: string; owner: string }> = {
  power: { evidence: "A DISCOM connection study or sanctioned-load letter naming the parcel", owner: "Utility liaison" },
  water: { evidence: "A written municipal or groundwater withdrawal allocation", owner: "Civil lead" },
  land: { evidence: "A surveyed boundary with net buildable area after setbacks", owner: "Land advisor" },
  schedule: { evidence: "An energisation date tied to a signed connection agreement", owner: "Utility liaison" },
  connectivity: { evidence: "A carrier route quote with diversity and measured latency", owner: "Network lead" },
  climate: { evidence: "A local station design-day dry-bulb and wet-bulb record", owner: "Mechanical lead" },
};

/** Conflicts first: a contradiction blocks the decision more than a gap does. */
const RANK: Record<CriterionState, number> = { conflict: 0, unknown: 1, fail: 2, pass: 9 };

export function nextChecks(assessment: Assessment): NextCheck[] {
  return assessment.criteria
    .filter((c) => c.state !== "pass")
    .sort((a, b) => RANK[a.state] - RANK[b.state])
    .map((c) => ({
      criterion: c.label,
      criterionId: c.id,
      state: c.state,
      why:
        c.state === "conflict"
          ? "Two sources disagree, so the decision cannot rest on either."
          : c.state === "unknown"
          ? "No sourced figure exists, so this cannot be called either way."
          : c.basis,
      evidence: NEEDS[c.id]?.evidence ?? "A sourced figure for this criterion",
      owner: NEEDS[c.id]?.owner ?? "Project lead",
    }));
}
