"use client";

import type { CriterionState } from "@/lib/analysis/evaluate";

/** Status is never colour alone — a glyph and a word accompany every hue. */
export const STATE_META: Record<CriterionState, { label: string; glyph: string; text: string; ring: string; dot: string }> = {
  pass: { label: "Supported", glyph: "✓", text: "text-active", ring: "ring-active/30", dot: "bg-active" },
  fail: { label: "Not met", glyph: "✕", text: "text-danger", ring: "ring-danger/30", dot: "bg-danger" },
  unknown: { label: "Unknown", glyph: "?", text: "text-caution", ring: "ring-caution/30", dot: "bg-caution" },
  conflict: { label: "Conflict", glyph: "!", text: "text-info", ring: "ring-info/30", dot: "bg-info" },
};

export function StateChip({ state }: { state: CriterionState }) {
  const m = STATE_META[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${m.text} ${m.ring} bg-white/[.03]`}>
      <span aria-hidden className="text-[10px]">{m.glyph}</span>
      {m.label}
    </span>
  );
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t hairline border-t px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="rounded-control bg-white/[.03] px-3 py-2.5 ring-1 ring-white/[.05]">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="tabular mt-0.5 text-[19px] font-semibold leading-tight text-ink">
        {value}
        {unit && <span className="ml-1 text-[11px] font-medium text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[10px] leading-snug text-muted/80">{hint}</div>}
    </div>
  );
}

export function SyntheticBadge({ children = "Synthetic fixture" }: { children?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-caution ring-1 ring-caution/25 bg-caution/[.07]">
      {children}
    </span>
  );
}
