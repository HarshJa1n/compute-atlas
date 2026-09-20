"use client";

import { useEffect, useRef, useState } from "react";
import { MAPBOX_TOKEN } from "@/lib/map/mapbox";

export type Place = { id: string; name: string; context: string; center: [number, number] };

/** Forward geocoding restricted to India, via Mapbox. Disabled without a token. */
async function geocode(q: string, signal: AbortSignal): Promise<Place[]> {
  if (!MAPBOX_TOKEN) return [];
  const url =
    `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}` +
    `&country=in&limit=5&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = (await res.json()) as {
    features?: Array<{ id: string; properties: { name?: string; place_formatted?: string; coordinates?: { longitude: number; latitude: number } } }>;
  };
  return (data.features ?? []).map((f) => ({
    id: f.id,
    name: f.properties.name ?? q,
    context: f.properties.place_formatted ?? "",
    center: [f.properties.coordinates?.longitude ?? 0, f.properties.coordinates?.latitude ?? 0],
  }));
}

export default function PlaceSearch({ onPick }: { onPick: (p: Place) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const ac = useRef<AbortController | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); setError(null); return; }
    const t = setTimeout(() => {
      ac.current?.abort();
      const c = new AbortController();
      ac.current = c;
      geocode(q.trim(), c.signal)
        .then((r) => { setResults(r); setOpen(true); setActive(0); setError(r.length ? null : "No match in India."); })
        .catch((e) => { if ((e as Error).name !== "AbortError") setError("Search unavailable."); });
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, []);

  const choose = (p: Place) => { onPick(p); setOpen(false); setQ(p.name); };

  if (!MAPBOX_TOKEN) return null;

  return (
    <div ref={box} className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && results[active]) { e.preventDefault(); choose(results[active]); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        placeholder="Search a place in India"
        aria-label="Search a place in India"
        role="combobox"
        aria-expanded={open}
        aria-controls="place-results"
        className="w-[190px] rounded-[6px] bg-bg/50 px-2.5 py-1.5 text-[11px] text-ink placeholder:text-muted/70 ring-1 ring-white/10 focus:ring-active/50"
      />
      {open && (results.length > 0 || error) && (
        <ul
          id="place-results"
          role="listbox"
          className="glass absolute left-0 top-[34px] z-30 w-[260px] overflow-hidden rounded-panel py-1"
        >
          {error && <li className="px-3 py-1.5 text-[11px] text-muted">{error}</li>}
          {results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
                className={`w-full px-3 py-1.5 text-left transition ${i === active ? "bg-white/[.07]" : ""}`}
              >
                <span className="block text-[12px] text-ink">{r.name}</span>
                {r.context && <span className="block text-[10px] text-muted">{r.context}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
