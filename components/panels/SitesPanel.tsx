"use client";

import { useRef, useState } from "react";
import { SyntheticBadge } from "./ui";

export type SiteRow = { id: string; name: string; kind: string; areaHa: number | null };

export default function SitesPanel({
  rows, selectedId, onSelect, onDraw, onClear, onImport, drawing, hasDrawn, error,
}: {
  rows: SiteRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDraw: () => void;
  onClear: () => void;
  onImport: (text: string) => void;
  drawing: boolean;
  hasDrawn: boolean;
  error: string | null;
}) {
  const [importing, setImporting] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="space-y-3 p-4">
      <div className="space-y-1.5">
        <button
          onClick={onDraw}
          aria-pressed={drawing}
          className={`w-full rounded-control px-3 py-2 text-[12px] font-semibold transition ring-1 ${
            drawing ? "bg-active text-bg ring-active" : "bg-white/[.03] text-ink ring-white/[.06] hover:bg-white/[.07]"
          }`}
        >
          {drawing ? "Drawing — click to place corners" : "Draw a site polygon"}
        </button>
        <div className="flex gap-1.5">
          <button
            onClick={() => setImporting((v) => !v)}
            className="flex-1 rounded-control px-3 py-1.5 text-[11px] font-medium text-muted ring-1 ring-white/[.06] transition hover:bg-white/[.05] hover:text-ink"
          >
            Import GeoJSON
          </button>
          <button
            onClick={onClear}
            disabled={!hasDrawn}
            className="flex-1 rounded-control px-3 py-1.5 text-[11px] font-medium text-muted ring-1 ring-white/[.06] transition hover:bg-white/[.05] hover:text-danger disabled:opacity-30"
          >
            Clear drawn
          </button>
        </div>
        {drawing && (
          <p className="text-[10px] leading-snug text-active/90">
            Click to add corners, double-click to finish. Escape cancels.
          </p>
        )}
      </div>

      {importing && (
        <div className="space-y-1.5">
          <textarea
            ref={ta}
            rows={4}
            placeholder='{"type":"Polygon","coordinates":[[[77.53,23.18],…]]}'
            className="w-full rounded-control bg-bg/60 p-2 font-mono text-[10px] text-ink placeholder:text-muted/50 ring-1 ring-white/10 focus:ring-active/50"
          />
          <button
            onClick={() => { onImport(ta.current?.value ?? ""); setImporting(false); }}
            className="w-full rounded-control bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-ink transition hover:bg-white/20"
          >
            Load polygon
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-control bg-danger/[.08] px-2.5 py-2 text-[11px] leading-snug text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      <div className="border-t hairline border-t pt-2.5">
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">
          Candidates ({rows.length})
        </h4>
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r.id)}
                aria-current={r.id === selectedId}
                className={`w-full rounded-control px-2.5 py-2 text-left transition ring-1 ${
                  r.id === selectedId
                    ? "bg-active/[.10] ring-active/30"
                    : "bg-white/[.02] ring-white/[.04] hover:bg-white/[.06]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[12px] font-medium ${r.id === selectedId ? "text-active" : "text-ink"}`}>
                    {r.name}
                  </span>
                  {r.kind === "synthetic" ? <SyntheticBadge>Fixture</SyntheticBadge> : null}
                </div>
                <span className="tabular text-[10px] text-muted">
                  {r.areaHa === null ? "geometry pending" : `${r.areaHa.toFixed(2)} ha`}
                  {r.kind === "user-drawn" && " · drawn by you"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] leading-snug text-muted/75">
          This list mirrors the map, so every candidate is reachable by keyboard.
        </p>
      </div>
    </div>
  );
}
