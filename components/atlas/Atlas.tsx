"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import type { Map as MLMap } from "maplibre-gl";
import { PRESETS, type Assessment, type ProjectBrief } from "@/lib/analysis/evaluate";
import SiteDossier, { type AssessContext } from "@/components/panels/SiteDossier";
import Investigation, { type Evt } from "@/components/panels/Investigation";
import BriefSheet from "@/components/panels/BriefSheet";
import CompareTray from "@/components/panels/CompareTray";
import { SyntheticBadge } from "@/components/panels/ui";

const AtlasCanvas = dynamic(() => import("./AtlasCanvas"), { ssr: false });

export type DemoSite = {
  id: string; name: string; kind: string; notice: string;
  geometry: Polygon; availableMW: number | null; waterCapLDay: number | null;
};

const BOOKMARKS: Array<{ name: string; center: [number, number]; zoom: number }> = [
  { name: "India", center: [79.5, 22.6], zoom: 3.7 },
  { name: "Bhopal", center: [77.53, 23.184], zoom: 11 },
  { name: "Indore", center: [75.985, 22.804], zoom: 11 },
  { name: "Nagpur", center: [79.025, 21.204], zoom: 11 },
  { name: "Hyderabad", center: [78.487, 17.385], zoom: 9.5 },
  { name: "Chennai", center: [80.271, 13.083], zoom: 9.5 },
];

const hectares = (g: Polygon) => turf.area(turf.polygon(g.coordinates)) / 10_000;
const centroidOf = (g: Polygon) => turf.centroid(turf.polygon(g.coordinates)).geometry.coordinates as [number, number];

export default function Atlas({ sites }: { sites: DemoSite[] }) {
  const mapRef = useRef<MLMap | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [brief, setBrief] = useState<ProjectBrief>(PRESETS.campus);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<Feature<Polygon> | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [context, setContext] = useState<AssessContext | null>(null);
  const [events, setEvents] = useState<Evt[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"live" | "recorded" | null>(null);
  const [layers, setLayers] = useState({ states: true, facilities: true, candidates: true });
  const [evidenceAdded, setEvidenceAdded] = useState(false);
  const [compare, setCompare] = useState<Array<{ id: string; name: string; assessment: Assessment }>>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [leftTab, setLeftTab] = useState<"brief" | "layers">("brief");
  const [railOpen, setRailOpen] = useState(true);

  // Below the 1200px breakpoint the spec collapses the layer panel so the two
  // side panels can never consume the whole map.
  useEffect(() => {
    const apply = () => setRailOpen(window.innerWidth >= 1200);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const candidates = useMemo(() => {
    const list = sites.map((s) => ({ id: s.id, name: `Parcel ${s.id}`, geometry: s.geometry }));
    if (drawn) list.push({ id: "drawn", name: "Your polygon", geometry: drawn.geometry });
    return list;
  }, [sites, drawn]);

  const active = useMemo(() => {
    if (selectedId === "drawn" && drawn) {
      return {
        id: "drawn", name: "Drawn polygon", kind: "user-drawn", notice: "",
        geometry: drawn.geometry, availableMW: null, waterCapLDay: null,
      } as DemoSite;
    }
    return sites.find((s) => s.id === selectedId) ?? null;
  }, [selectedId, sites, drawn]);

  const areaHa = active ? hectares(active.geometry) : null;

  /** Site A gains a documented contradiction once the utility note is ingested. */
  const sitePayload = useCallback(() => {
    if (!active) return null;
    const conflict =
      evidenceAdded && active.id === "A"
        ? { claim: "Broker brief: 30 MW by June 2027", counterClaim: "Utility note: 12 MW, conditional, Dec 2027" }
        : (false as const);
    return {
      id: active.id,
      name: active.name,
      kind: active.kind,
      areaHectares: areaHa,
      availableMW: active.availableMW,
      availableFromDate: evidenceAdded && active.id === "A" ? "2027-12-01" : null,
      waterCapLDay: active.waterCapLDay,
      powerConflict: conflict,
    };
  }, [active, areaHa, evidenceAdded]);

  // Re-assess whenever the brief, site or evidence changes. Stale responses are dropped.
  const runId = useRef(0);
  useEffect(() => {
    const site = sitePayload();
    if (!site || !active) { setAssessment(null); setContext(null); return; }
    const id = ++runId.current;
    const centroid = centroidOf(active.geometry);
    fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, site, centroid }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (id !== runId.current) return; // a newer request has superseded this one
        setAssessment(d.assessment);
        setContext(d.context);
      })
      .catch(() => {});
  }, [brief, sitePayload, active]);

  const fly = (b: (typeof BOOKMARKS)[number]) =>
    mapRef.current?.flyTo({ center: b.center, zoom: b.zoom, duration: 1100 });

  const selectSite = useCallback((id: string) => {
    setSelectedId(id);
    setEvents([]);
    setMode(null);
    const geom = id === "drawn" ? drawn?.geometry : sites.find((s) => s.id === id)?.geometry;
    if (geom) {
      const bbox = turf.bbox(turf.polygon(geom.coordinates)) as [number, number, number, number];
      mapRef.current?.fitBounds(bbox, { padding: 160, duration: 900, maxZoom: 13 });
    }
  }, [sites, drawn]);

  const ask = useCallback(async (question: string) => {
    const site = sitePayload();
    if (!site || !active) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setEvents([]);

    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, brief, site, centroid: centroidOf(active.geometry) }),
        signal: ac.signal,
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as Evt;
          if (evt.type === "mode") setMode(evt.mode);
          else if (evt.type === "done") continue;
          else setEvents((p) => [...p, evt]);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setEvents((p) => [...p, { type: "notice", text: "Investigation failed. Computed results above are unchanged." }]);
      }
    } finally {
      setBusy(false);
    }
  }, [brief, active, sitePayload]);

  const addToCompare = () => {
    if (!active || !assessment) return;
    setCompare((p) =>
      p.some((x) => x.id === active.id) ? p : [...p, { id: active.id, name: active.name, assessment }].slice(-3)
    );
    setShowCompare(true);
  };

  const exportBrief = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      brief,
      site: sitePayload(),
      assessment,
      context,
      evidenceIngested: evidenceAdded ? ["demo-broker-A", "demo-utility-A"] : [],
      notice: "Screening export. Synthetic parcels and documents. Not an engineering or legal opinion.",
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `compute-atlas-${active?.id ?? "site"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Escape clears the current selection before anything else.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowCompare(false); setSelectedId(null); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-bg">
      <AtlasCanvas
        onReady={(m) => { mapRef.current = m; }}
        onDraw={(f) => { setDrawn(f); if (f) selectSite("drawn"); }}
        onSelectSite={selectSite}
        candidates={candidates}
        selectedId={selectedId}
        layers={layers}
      />

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
        <div className="glass pointer-events-auto rounded-panel px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-active" aria-hidden />
            <h1 className="text-[13px] font-semibold tracking-tight text-ink">Compute Atlas</h1>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">
              Prototype
            </span>
          </div>
          <p className="mt-0.5 text-[10.5px] text-muted">
            Before you build an AI factory, prove the site can support it.
          </p>
        </div>

        <div className="glass pointer-events-auto flex items-center gap-1 rounded-panel p-1">
          <button
            onClick={() => setRailOpen((v) => !v)}
            aria-expanded={railOpen}
            aria-label={railOpen ? "Hide project panel" : "Show project panel"}
            className="rounded-[6px] px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:bg-white/[.07] hover:text-ink"
          >
            {railOpen ? "◀ Panel" : "▶ Panel"}
          </button>
          <span className="mx-1 h-4 w-px bg-white/10" />
          {BOOKMARKS.map((b) => (
            <button
              key={b.name}
              onClick={() => fly(b)}
              className="hidden rounded-[6px] px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:bg-white/[.07] hover:text-ink sm:block"
            >
              {b.name}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/10" />
          <button
            onClick={exportBrief}
            disabled={!assessment}
            className="rounded-[6px] px-2.5 py-1.5 text-[11px] font-semibold text-active transition hover:bg-active/10 disabled:opacity-30"
          >
            Export
          </button>
        </div>
      </header>

      {/* Left rail */}
      <aside
        hidden={!railOpen}
        className="glass absolute left-3 top-[86px] z-20 w-[262px] overflow-hidden rounded-panel"
      >
        <div className="flex border-b hairline border-b">
          {(["brief", "layers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setLeftTab(t)}
              aria-pressed={leftTab === t}
              className={`flex-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[.12em] transition ${
                leftTab === t ? "text-active" : "text-muted hover:text-ink"
              }`}
            >
              {t === "brief" ? "Project" : "Layers"}
            </button>
          ))}
        </div>

        {leftTab === "brief" ? (
          <BriefSheet brief={brief} onChange={setBrief} onPreset={(m) => setBrief(PRESETS[m])} />
        ) : (
          <div className="space-y-2.5 p-4">
            {([
              ["states", "State boundaries", "geoBoundaries ADM1"],
              ["facilities", "Carrier facilities", "PeeringDB · 203 points"],
              ["candidates", "Candidate parcels", "Synthetic fixtures"],
            ] as const).map(([k, label, src]) => (
              <label key={k} className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={layers[k]}
                  onChange={(e) => setLayers((p) => ({ ...p, [k]: e.target.checked }))}
                  className="mt-0.5 accent-active"
                />
                <span>
                  <span className="block text-[12px] font-medium text-ink">{label}</span>
                  <span className="block text-[10px] text-muted">{src}</span>
                </span>
              </label>
            ))}
            <div className="border-t hairline border-t pt-2.5">
              <p className="text-[10px] leading-snug text-muted/80">
                Layers shown are context, not capacity. Power network and water-stress layers are{" "}
                <span className="text-caution">unavailable</span> in this prototype rather than approximated.
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Evidence action */}
      <div hidden={!railOpen} className="glass absolute bottom-3 left-3 z-20 w-[262px] rounded-panel p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted">Evidence</h3>
          <SyntheticBadge>Fixtures</SyntheticBadge>
        </div>
        <button
          onClick={() => setEvidenceAdded((v) => !v)}
          className={`w-full rounded-control px-3 py-2 text-left text-[11.5px] font-medium transition ring-1 ${
            evidenceAdded
              ? "bg-info/[.10] text-info ring-info/25"
              : "bg-white/[.03] text-ink ring-white/[.06] hover:bg-white/[.06]"
          }`}
        >
          {evidenceAdded ? "Utility note ingested — remove" : "Ingest broker brief + utility note"}
        </button>
        <p className="mt-1.5 text-[10px] leading-snug text-muted/80">
          {evidenceAdded
            ? "Parcel A now carries a documented contradiction: 30 MW claimed against 12 MW conditional."
            : "Adds two synthetic documents to Parcel A. Their figures disagree."}
        </p>
      </div>

      {/* Right panels */}
      <aside className="glass absolute right-3 top-[86px] bottom-3 z-20 flex w-[300px] flex-col overflow-hidden rounded-panel lg:w-[340px] xl:w-[368px]">
        <div className="min-h-0 flex-[3] overflow-hidden border-b hairline border-b">
          <SiteDossier
            name={active?.name ?? ""}
            kind={active?.kind ?? ""}
            areaHa={areaHa}
            assessment={assessment}
            context={context}
            onInvestigate={() => ask("Assess this site against the current brief and tell me what remains unproven.")}
            onCompare={addToCompare}
            busy={busy}
          />
        </div>
        <div className="min-h-[240px] flex-[2]">
          <Investigation
            events={events}
            busy={busy}
            mode={mode}
            onAsk={ask}
            onCancel={() => abortRef.current?.abort()}
            disabled={!active}
          />
        </div>
      </aside>

      {showCompare && compare.length > 0 && (
        <div className={`absolute bottom-3 z-20 right-[316px] lg:right-[356px] xl:right-[386px] ${railOpen ? "left-[286px]" : "left-3"}`}>
          <CompareTray
            rows={compare}
            onRemove={(id) => setCompare((p) => p.filter((x) => x.id !== id))}
            onClose={() => setShowCompare(false)}
          />
        </div>
      )}

      {!selectedId && (
        <div className="glass pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-panel px-4 py-2.5">
          <p className="text-[11.5px] text-muted">
            Click a parcel, or use the polygon tool to draw anywhere in India.
          </p>
        </div>
      )}
    </main>
  );
}
