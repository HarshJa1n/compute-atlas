// Snapshot handed to the printable report. Written to localStorage so the
// report opens in its own tab and prints without a server round trip.
import type { Assessment, ProjectBrief } from "./analysis/evaluate";
import type { Run } from "./analysis/scenario";
import type { Claim } from "./analysis/extract";

export const REPORT_KEY = "compute-atlas:report";

export type ReportSnapshot = {
  generatedAt: string;
  siteName: string;
  siteKind: string;
  areaHectares: number | null;
  brief: ProjectBrief;
  assessment: Assessment;
  history: Array<Pick<Run, "version" | "label" | "at">>;
  documents: Array<{ title: string; origin: string; claims: Claim[] }>;
  context: {
    nearestFacility: { name: string; city: string; km: number; url: string } | null;
    climate: { station: string; km: number; period: string; peakMonth: string; inCoverage: boolean };
  } | null;
  sources: Array<{ id: string; name: string; url: string; scale: string; kind: string }>;
};

export function stashReport(snapshot: ReportSnapshot): string {
  const key = `${REPORT_KEY}:${Date.now().toString(36)}`;
  localStorage.setItem(key, JSON.stringify(snapshot));
  return key;
}

export function readReport(key: string): ReportSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ReportSnapshot) : null;
  } catch {
    return null;
  }
}
