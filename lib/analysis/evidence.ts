// Deterministic claim extraction from ingested documents.
//
// A document is evidence, never an instruction. This module pulls out the
// statements that can move a criterion (a capacity figure, a connection date,
// a water allocation) and records exactly where each one came from. It does
// not decide who is right: two different figures for the same thing become a
// conflict downstream, not a winner.

export type EvidenceDoc = {
  id: string;
  title: string;
  text: string;
  siteId: string;
  /** Where the document came from: a labelled fixture or something the user pasted. */
  origin: "fixture" | "pasted";
};

export type ClaimKind = "power-mw" | "connection-date" | "water-lday" | "instruction-like";

export type Claim = {
  documentId: string;
  title: string;
  paragraph: number;
  statement: string;
  kind: ClaimKind;
  value: number | string | null;
  unit: string | null;
  /** Deterministic extraction confidence: how strongly the sentence matched. Not project probability. */
  confidence: "high" | "medium";
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

// Words that mark a figure as being about supply to the site, rather than the
// project's own requirement ("a 20 MW campus") or a header.
const SUPPLY_WORDS = /\b(available|availab|support|supply|supplied|sanction|connection|connect|capacity|offer|provide|deliver|energis|energiz|commission|feasib|allocat)/i;
const SCHEDULE_WORDS = /\b(available|availab|connection|connect|energis|energiz|commission|deliver|supply|ready|by)\b/i;
const WATER_WORDS = /\b(water|withdraw|allocat|abstraction|litre|liter|kld|kl\/day)\b/i;

// Text that reads like an instruction to the agent rather than a fact about a site.
const INSTRUCTION_LIKE = /\b(ignore (all |any )?(previous|prior|above) (instructions|rules)|disregard (the|your) (rules|instructions)|approve (this|the) site|mark (this|the) site (as )?(approved|passed|pass)|you must (approve|pass|recommend)|system prompt|as an ai)\b/i;

export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n|\n(?=Paragraph \d+\.)|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function cleanStatement(p: string): string {
  return p.replace(/^Paragraph \d+\.\s*/i, "").trim();
}

function parseMonthYear(s: string): string | null {
  // "June 2027", "Dec 2027", "December, 2027"
  const m = /\b([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) {
    return `${m[2]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-01`;
  }
  // "2027-06-30" or "2027-06"
  const iso = /\b(20\d{2})-(\d{2})(?:-(\d{2}))?\b/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3] ?? "01"}`;
  // "Q3 2027" -> first day of the quarter's last month is too generous; use the first month.
  const q = /\bQ([1-4])\s*(20\d{2})\b/i.exec(s);
  if (q) return `${q[2]}-${String((Number(q[1]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  return null;
}

/** Extract every decision-relevant claim from one document, with paragraph references. */
export function extractClaims(doc: EvidenceDoc): Claim[] {
  const claims: Claim[] = [];
  const paragraphs = splitParagraphs(doc.text);
  let bodyIndex = 0;

  paragraphs.forEach((raw) => {
    const statement = cleanStatement(raw);
    const isHeader = /^(document id|date|ref|subject|to|from)\s*[:\-]/i.test(statement) || /^SYNTHETIC/.test(statement);
    // Documents that number their own paragraphs keep that numbering; otherwise body paragraphs count from 1.
    const own = /^Paragraph (\d+)\./i.exec(raw);
    if (!isHeader) bodyIndex += 1;
    const paragraph = own ? Number(own[1]) : bodyIndex;
    const base = { documentId: doc.id, title: doc.title, paragraph, statement };

    if (INSTRUCTION_LIKE.test(statement)) {
      claims.push({ ...base, kind: "instruction-like", value: null, unit: null, confidence: "high" });
    }

    // Skip document headers; a header date is not a connection date.
    if (isHeader) return;

    const mw = /(\d+(?:\.\d+)?)\s*MW\b/gi;
    let m: RegExpExecArray | null;
    while ((m = mw.exec(statement))) {
      const before = statement.slice(0, m.index);
      // "a 20 MW IT campus" / "20 MW IT load" is the requirement, not supply.
      const after = statement.slice(m.index + m[0].length);
      const isRequirement = /\b(propos\w*|planned|requir\w*|campus of|load of)\s+(a\s+)?$/i.test(before) || /\bfor\s+a\s+$/i.test(before) || /^\s*(IT|campus|load|facility)\b/i.test(after);
      if (!SUPPLY_WORDS.test(statement) || isRequirement) continue;
      claims.push({ ...base, kind: "power-mw", value: Number(m[1]), unit: "MW", confidence: /\b(sanction|connection agreement|committed|firm)\b/i.test(statement) ? "high" : "medium" });
    }

    if (SCHEDULE_WORDS.test(statement) && /\b(20\d{2})\b/.test(statement)) {
      const date = parseMonthYear(statement);
      if (date) claims.push({ ...base, kind: "connection-date", value: date, unit: "date", confidence: /\b(earliest|indicative|could|may|target)\b/i.test(statement) ? "medium" : "high" });
    }

    if (WATER_WORDS.test(statement)) {
      const w = /(\d[\d,]*(?:\.\d+)?)\s*(L\/day|litres? per day|liters? per day|lpd|kld|kl\/day)/i.exec(statement);
      if (w) {
        let v = Number(w[1].replace(/,/g, ""));
        if (/^kl/i.test(w[2])) v *= 1000;
        if (Number.isFinite(v)) claims.push({ ...base, kind: "water-lday", value: v, unit: "L/day", confidence: "medium" });
      }
    }
  });

  return claims;
}

export type Disagreement = { claim: string; counterClaim: string };

export type SiteFacts = {
  availableMW: number | null;
  availableFromDate: string | null;
  waterCapLDay: number | null;
  powerConflict: Disagreement | false;
  scheduleConflict: Disagreement | false;
  /** Human-readable provenance per criterion, e.g. "Utility note ¶1: 12 MW". */
  sources: { power: string[]; schedule: string[]; water: string[] };
  instructionLike: Array<{ documentId: string; title: string; paragraph: number; statement: string }>;
};

const short = (c: Claim) => `${c.title} ¶${c.paragraph}: ${c.kind === "connection-date" ? String(c.value).slice(0, 7) : `${Number(c.value).toLocaleString("en-IN")} ${c.unit}`}`;

/**
 * Combine fixture figures and document claims into the inputs the evaluator
 * needs. One distinct figure is used as stated; two or more distinct figures
 * become a conflict that names both. Nothing is averaged or preferred.
 */
export function deriveSiteFacts(
  fixture: { availableMW: number | null; waterCapLDay: number | null; availableFromDate?: string | null; label?: string },
  claims: Claim[]
): SiteFacts {
  const fx = fixture.label ?? "Fixture";
  const power: Array<{ v: number; s: string }> = [];
  const dates: Array<{ v: string; s: string }> = [];
  const water: Array<{ v: number; s: string }> = [];

  if (fixture.availableMW !== null && fixture.availableMW !== undefined) power.push({ v: fixture.availableMW, s: `${fx}: ${fixture.availableMW} MW` });
  if (fixture.availableFromDate) dates.push({ v: fixture.availableFromDate, s: `${fx}: ${fixture.availableFromDate.slice(0, 7)}` });
  if (fixture.waterCapLDay !== null && fixture.waterCapLDay !== undefined) water.push({ v: fixture.waterCapLDay, s: `${fx}: ${fixture.waterCapLDay.toLocaleString("en-IN")} L/day` });

  for (const c of claims) {
    if (c.kind === "power-mw" && typeof c.value === "number") power.push({ v: c.value, s: short(c) });
    if (c.kind === "connection-date" && typeof c.value === "string") dates.push({ v: c.value, s: short(c) });
    if (c.kind === "water-lday" && typeof c.value === "number") water.push({ v: c.value, s: short(c) });
  }

  const distinct = <T>(xs: Array<{ v: T; s: string }>) => Array.from(new Map(xs.map((x) => [String(x.v), x])).values());
  const dp = distinct(power);
  const dd = distinct(dates.map((d) => ({ v: d.v.slice(0, 7), s: d.s })));
  const dw = distinct(water);

  return {
    availableMW: dp.length === 1 ? dp[0].v : null,
    availableFromDate: dd.length === 1 ? dates.find((d) => d.v.slice(0, 7) === dd[0].v)!.v : null,
    waterCapLDay: dw.length === 1 ? dw[0].v : null,
    powerConflict: dp.length > 1 ? { claim: dp[0].s, counterClaim: dp.slice(1).map((x) => x.s).join(" · ") } : false,
    scheduleConflict: dd.length > 1 ? { claim: dd[0].s, counterClaim: dd.slice(1).map((x) => x.s).join(" · ") } : false,
    sources: { power: power.map((x) => x.s), schedule: dates.map((x) => x.s), water: water.map((x) => x.s) },
    instructionLike: claims
      .filter((c) => c.kind === "instruction-like")
      .map((c) => ({ documentId: c.documentId, title: c.title, paragraph: c.paragraph, statement: c.statement })),
  };
}
