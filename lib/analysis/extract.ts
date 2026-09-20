// Document extraction. Extraction and inference are deliberately separate:
// a claim records what a document SAYS, with a paragraph reference. Deciding
// what that means for the project happens later, in reconcile().

export type ClaimKind = "power-capacity" | "water-cap" | "connection-date" | "unclassified";

export type Claim = {
  documentId: string;
  documentTitle: string;
  paragraph: number;
  statement: string;
  kind: ClaimKind;
  /** Parsed observation. Null when the paragraph carries no machine-readable value. */
  value: number | null;
  unit: string | null;
  /** True when the document itself disclaims the figure (indicative, non-binding). */
  qualified: boolean;
};

export type EvidenceDoc = {
  id: string;
  title: string;
  siteId: string;
  text: string;
  /** Where the text came from, shown to the user. */
  origin: "fixture" | "upload" | "paste";
  ingestedAt: string;
};

const QUALIFIERS = /\b(indicative|non-?binding|no binding|preliminary|conditional|subject to|assumes|not constitute|does not constitute|scenario)\b/i;

/** Splits into paragraphs, preserving 1-based numbering for citation. */
export function paragraphs(text: string): Array<{ n: number; text: string }> {
  const explicit = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^Paragraph\s+\d+\./i.test(l));

  if (explicit.length) {
    return explicit.map((l, i) => ({ n: i + 1, text: l.replace(/^Paragraph\s+\d+\.\s*/i, "") }));
  }

  return text
    .split(/\n\s*\n|\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p, i) => ({ n: i + 1, text: p }));
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Returns an ISO date for "June 2027" / "December 2027" / "2027-06-30". */
function parseDate(s: string): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (iso) return iso[0];
  const my = /\b([A-Za-z]+)\s+(\d{4})\b/.exec(s);
  if (my) {
    const m = MONTHS[my[1].toLowerCase()];
    if (m) return `${my[2]}-${String(m).padStart(2, "0")}-01`;
  }
  return null;
}

export function extractClaims(doc: EvidenceDoc): Claim[] {
  return paragraphs(doc.text).map(({ n, text }) => {
    const qualified = QUALIFIERS.test(text);
    const base = { documentId: doc.id, documentTitle: doc.title, paragraph: n, statement: text, qualified };

    const mw = /(\d+(?:\.\d+)?)\s*MW\b/i.exec(text);
    if (mw) return { ...base, kind: "power-capacity" as const, value: Number(mw[1]), unit: "MW" };

    const water = /(\d[\d,]*)\s*(?:L|litres?|liters?)\s*(?:\/|per\s+)day/i.exec(text);
    if (water) return { ...base, kind: "water-cap" as const, value: Number(water[1].replace(/,/g, "")), unit: "L/day" };

    if (/\b(connection|energis|energiz|available|commission)/i.test(text)) {
      const d = parseDate(text);
      if (d) return { ...base, kind: "connection-date" as const, value: null, unit: d };
    }

    return { ...base, kind: "unclassified" as const, value: null, unit: null };
  });
}

export type Reconciled = {
  availableMW: number | null;
  waterCapLDay: number | null;
  availableFromDate: string | null;
  powerConflict: { claim: string; counterClaim: string } | false;
  /** Every figure that fed the result, for display. */
  supporting: Claim[];
};

const cite = (c: Claim) =>
  `${c.documentTitle} (para ${c.paragraph}): ${c.value}${c.unit ? ` ${c.unit}` : ""}`;

/**
 * Turns claims into project inputs. Disagreement is reported, never resolved:
 * two different stated capacities produce a conflict rather than a chosen value.
 */
export function reconcile(claims: Claim[]): Reconciled {
  const power = claims.filter((c) => c.kind === "power-capacity" && c.value !== null);
  const water = claims.filter((c) => c.kind === "water-cap" && c.value !== null);
  const dates = claims.filter((c) => c.kind === "connection-date" && c.unit);

  // Distinct stated capacities from different documents is a contradiction.
  const distinct = Array.from(new Set(power.map((c) => c.value)));
  const crossDocument = new Set(power.map((c) => c.documentId)).size > 1;
  const conflict =
    distinct.length > 1 && crossDocument
      ? (() => {
          const sorted = [...power].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
          return { claim: cite(sorted[0]), counterClaim: cite(sorted[sorted.length - 1]) };
        })()
      : (false as const);

  // With no contradiction, the most cautious stated figure is used.
  const availableMW = conflict ? null : power.length ? Math.min(...power.map((c) => c.value as number)) : null;
  const waterCapLDay = water.length ? Math.min(...water.map((c) => c.value as number)) : null;
  const availableFromDate = dates.length
    ? dates.map((c) => c.unit as string).sort().reverse()[0] // latest stated date is the binding one
    : null;

  return {
    availableMW,
    waterCapLDay,
    availableFromDate,
    powerConflict: conflict,
    supporting: [...power, ...water, ...dates],
  };
}
