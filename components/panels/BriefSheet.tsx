"use client";

import type { ProjectBrief } from "@/lib/analysis/evaluate";

const FIELDS: Array<{ k: keyof ProjectBrief; label: string; unit?: string; step: number; min?: number; max?: number }> = [
  { k: "itMW", label: "IT load", unit: "MW", step: 0.5, min: 0.5, max: 200 },
  { k: "pue", label: "PUE", step: 0.01, min: 1, max: 2.5 },
  { k: "utilization", label: "Utilisation", step: 0.05, min: 0, max: 1 },
  { k: "wueLitresPerITkWh", label: "WUE", unit: "L/kWh", step: 0.05, min: 0, max: 3 },
  { k: "tariffINRPerKWh", label: "Tariff", unit: "₹/kWh", step: 0.5, min: 0, max: 30 },
  { k: "requiredHectares", label: "Land needed", unit: "ha", step: 0.2, min: 0.1, max: 200 },
];

export default function BriefSheet({
  brief, onChange, onPreset,
}: {
  brief: ProjectBrief;
  onChange: (b: ProjectBrief) => void;
  onPreset: (m: "campus" | "modular") => void;
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-1.5 rounded-control bg-bg/60 p-1 ring-1 ring-white/[.06]">
        {(["campus", "modular"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onPreset(m)}
            aria-pressed={brief.mode === m}
            className={`rounded-[6px] px-3 py-1.5 text-[12px] font-semibold capitalize transition ${
              brief.mode === m ? "bg-active text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {FIELDS.map((f) => (
          <label key={String(f.k)} className="block">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-muted">{f.label}</span>
              <span className="tabular text-[12px] font-semibold text-ink">
                {f.k === "utilization"
                  ? `${Math.round((brief[f.k] as number) * 100)}%`
                  : (brief[f.k] as number).toLocaleString("en-IN")}
                {f.unit && <span className="ml-0.5 text-[10px] font-normal text-muted">{f.unit}</span>}
              </span>
            </div>
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={brief[f.k] as number}
              onChange={(e) => onChange({ ...brief, [f.k]: Number(e.target.value) })}
              className="w-full accent-active"
            />
          </label>
        ))}

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">Target opening</span>
          <input
            type="date"
            value={brief.openingDate}
            onChange={(e) => onChange({ ...brief, openingDate: e.target.value })}
            className="w-full rounded-control bg-bg/60 px-2.5 py-1.5 text-[12px] text-ink ring-1 ring-white/10 focus:ring-active/50 [color-scheme:dark]"
          />
        </label>
      </div>

      <p className="text-[10px] leading-snug text-muted/75">
        Every field is an assumption you supply, versioned into the assessment. Changing one creates a new run rather
        than rewriting history.
      </p>
    </div>
  );
}
