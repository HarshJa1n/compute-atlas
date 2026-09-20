"use client";

import type { Layers } from "@/components/atlas/AtlasCanvas";

type LayerSpec = {
  key: keyof Layers;
  label: string;
  source: string;
  scale: string;
  url?: string;
  swatch: React.ReactNode;
};

const dot = (color: string) => (
  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
);
const line = (color: string) => (
  <span className="inline-block h-0.5 w-4 rounded" style={{ background: color }} aria-hidden />
);

const LAYERS: LayerSpec[] = [
  {
    key: "states",
    label: "State boundaries",
    source: "geoBoundaries ADM1",
    scale: "administrative outlines",
    url: "https://www.geoboundaries.org/",
    swatch: line("#7ebbff"),
  },
  {
    key: "facilities",
    label: "Carrier facilities",
    source: "PeeringDB",
    scale: "203 point records",
    url: "https://www.peeringdb.com/",
    swatch: dot("#7ebbff"),
  },
  {
    key: "candidates",
    label: "Candidate parcels",
    source: "Demonstration fixtures",
    scale: "fictional polygons",
    swatch: (
      <span
        className="inline-block h-2.5 w-3.5 rounded-[2px] border"
        style={{ borderColor: "#43dfc3", background: "rgba(67,223,195,.22)" }}
        aria-hidden
      />
    ),
  },
];

/** Layers we deliberately do not draw, named so their absence is visible. */
const UNAVAILABLE = [
  { label: "Transmission network", why: "No licensed line or substation capacity dataset is loaded." },
  { label: "Water stress", why: "No basin-level withdrawal dataset is loaded." },
  { label: "Hazard zones", why: "Seismic and flood layers are not part of this build." },
];

export default function LayerLegend({
  layers, onToggle,
}: {
  layers: Layers;
  onToggle: (k: keyof Layers, v: boolean) => void;
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="space-y-2.5">
        {LAYERS.map((l) => (
          <div key={l.key} className="flex items-start gap-2.5">
            <input
              id={`layer-${l.key}`}
              type="checkbox"
              checked={layers[l.key]}
              onChange={(e) => onToggle(l.key, e.target.checked)}
              className="mt-1 accent-active"
            />
            <label htmlFor={`layer-${l.key}`} className="flex-1 cursor-pointer">
              <span className="flex items-center gap-1.5">
                {l.swatch}
                <span className="text-[12px] font-medium text-ink">{l.label}</span>
              </span>
              <span className="mt-0.5 block text-[10px] leading-snug text-muted">
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-info underline decoration-info/40 underline-offset-2">
                    {l.source}
                  </a>
                ) : (
                  l.source
                )}
                {" · "}
                {l.scale}
              </span>
            </label>
          </div>
        ))}
      </div>

      <div className="border-t hairline border-t pt-2.5">
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">Selection states</h4>
        <ul className="space-y-1">
          {[
            ["#43dfc3", "Selected site"],
            ["#a8bac7", "Unselected candidate"],
          ].map(([c, label]) => (
            <li key={label} className="flex items-center gap-2 text-[11px] text-muted">
              <span className="inline-block h-2.5 w-3.5 rounded-[2px] border" style={{ borderColor: c }} aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t hairline border-t pt-2.5">
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-caution">Unavailable</h4>
        <ul className="space-y-1.5">
          {UNAVAILABLE.map((u) => (
            <li key={u.label}>
              <span className="text-[11.5px] font-medium text-muted line-through decoration-muted/40">{u.label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-muted/75">{u.why}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] leading-snug text-muted/75">
          These are named rather than approximated. A criterion without data reads unknown.
        </p>
      </div>
    </div>
  );
}
