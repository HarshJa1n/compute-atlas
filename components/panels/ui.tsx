"use client";

import { useEffect, useRef, useState } from "react";
import type { CriterionState } from "@/lib/analysis/evaluate";

/** Status is never colour alone — a glyph and a word accompany every hue. */
export const STATE_META: Record<CriterionState, { label: string; glyph: string; text: string; ring: string; dot: string; bg: string }> = {
  pass: { label: "Supported", glyph: "✓", text: "text-active", ring: "ring-active/35", dot: "bg-active", bg: "bg-active/10" },
  fail: { label: "Not met", glyph: "✕", text: "text-danger", ring: "ring-danger/35", dot: "bg-danger", bg: "bg-danger/10" },
  unknown: { label: "Unknown", glyph: "?", text: "text-caution", ring: "ring-caution/35", dot: "bg-caution", bg: "bg-caution/10" },
  conflict: { label: "Conflict", glyph: "!", text: "text-conflict", ring: "ring-conflict/35", dot: "bg-conflict", bg: "bg-conflict/10" },
};

export function StateChip({ state }: { state: CriterionState }) {
  const m = STATE_META[state];
  return (
    <span className={`chip inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${m.text} ${m.ring} ${m.bg}`}>
      <span aria-hidden className="font-mono text-[10px]">{m.glyph}</span>
      {m.label}
    </span>
  );
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t hairline border-t px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[.16em] text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Renders a value that blurs for one frame when it changes, so a recompute reads as one number resolving. */
export function SwapValue({ value, className = "" }: { value: string; className?: string }) {
  const prev = useRef(value);
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setChanging(true);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setChanging(false)));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <span className={`value-swap inline-block ${className}`} data-changing={changing ? "true" : "false"}>{value}</span>;
}

export function Stat({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="rounded-control bg-white/[.03] px-3 py-2.5 ring-1 ring-white/[.06]">
      <div className="text-[10px] uppercase tracking-[.12em] text-muted">{label}</div>
      <div className="tabular mt-0.5 text-[18px] font-medium leading-tight text-ink">
        <SwapValue value={value} />
        {unit && <span className="ml-1 font-sans text-[11px] font-medium text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[10px] leading-snug text-muted/80">{hint}</div>}
    </div>
  );
}

export function SyntheticBadge({ children = "Synthetic fixture" }: { children?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.08em] text-caution ring-1 ring-caution/30 bg-caution/[.08]">
      {children}
    </span>
  );
}

/** Small brand mark: a stylised map pin over a grid, drawn inline so it needs no asset. */
export function Mark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="currentColor" strokeOpacity=".35" />
      <path d="M2.5 12h19M12 2.5v19" stroke="currentColor" strokeOpacity=".2" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  );
}

/** Button variants shared across panels so the surface stays consistent. */
export const btn = {
  primary: "rounded-control bg-brand px-3 py-2 text-[12px] font-semibold text-bg transition hover:brightness-110 disabled:opacity-40",
  secondary: "rounded-control bg-white/[.05] px-3 py-2 text-[12px] font-semibold text-ink ring-1 ring-white/[.08] transition hover:bg-white/[.09] disabled:opacity-40",
  ghost: "rounded-control px-3 py-1.5 text-[11.5px] font-medium text-muted ring-1 ring-white/[.08] transition hover:bg-white/[.05] hover:text-ink disabled:opacity-30",
  toolbar: "rounded-[7px] px-2.5 py-1.5 text-[11.5px] font-medium text-muted transition hover:bg-white/[.07] hover:text-ink disabled:opacity-30",
};
