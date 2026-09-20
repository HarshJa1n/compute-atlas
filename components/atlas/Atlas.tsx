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
import SitesPanel from "@/components/panels/SitesPanel";
import EvidencePanel, { type IngestedDoc } from "@/components/panels/EvidencePanel";
import LayerLegend from "@/components/panels/LayerLegend";
import PlaceSearch from "@/components/panels/PlaceSearch";
import { reconcile, type Claim } from "@/lib/analysis/extract";
import { appendRun, describeChange, diff, type Delta, type Run } from "@/lib/analysis/scenario";
import { stashReport } from "@/lib/report";
import { parsePolygon, validatePolygon } from "@/lib/analysis/geometry";
import { SyntheticBadge } from "@/components/panels/ui";
import type { Bookmark } from "@/lib/data";
import { SOURCES_PUBLIC } from "@/lib/sources";

import type { DrawControls } from "./AtlasCanvas";

const AtlasCanvas = dynamic(() => import("./AtlasCanvas"), { ssr: false });

export type DemoSite = {
  id: string; name: string; kind: string; notice: string;
  geometry: Polygon; availableMW: number | null; waterCapLDay: number | null;
};

const STATE_WORDS: Record<string, string> = {
  pass: "Supported", fail: "Not met", unknown: "Unknown", conflict: "Conflict",
};

const hectares = (g: Polygon) => turf.area(turf.polygon(g.coordinates)) / 10_000;
const centroidOf = (g: Polygon) => turf.centroid(turf.polygon(g.coordinates)).geometry.coordinates as [number, number];

export default function Atlas({
  sites,
  bookmarks,
  indiaBounds,
}: {
  sites: DemoSite[];
  bookmarks: Bookmark[];
  indiaBounds: [number, number, number, number];
}) {
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
  const [compare, setCompare] = useState<Array<{ id: string; name: string; assessment: Assessment }>>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [leftTab, setLeftTab] = useState<"sites" | "brief" | "evidence" | "layers">("sites");
  const [docs, setDocs] = useState<IngestedDoc[]>([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [deltas, setDeltas] = useState<Delta[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [geomError, setGeomError] = useState<string | null>(null);
  const [hasGeometry, setHasGeometry] = useState(false);
  const controls = useRef<DrawControls | null>(null);
  const [railOpen, setRailOpen] = useState(true);

  // Below the 1200px breakpoint the spec collapses the layer panel so the two
  // side panels can never consume the whole map.
  useEffect(() => {
    const apply = () => setRailOpen(window.innerWidth >= 1200);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const candidates = useMemo(
    () => sites.map((s) => ({ id: s.id, name: `Parcel ${s.id}`, geometry: s.geometry })),
    [sites]
  );

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

  /** Claims for the selected site, and what they reconcile to. */
  const siteDocs = useMemo(
    () => docs.filter((d) => d.meta.siteId === (active?.id ?? "")),
    [docs, active]
  );
  const reconciled = useMemo(
    () => reconcile(siteDocs.flatMap((d) => d.claims) as Claim[]),
    [siteDocs]
  );

  const sitePayload = useCallback(() => {
    if (!active) return null;
    // Ingested evidence takes precedence over a fixture figure; a contradiction
    // resolves to no number at all, which the engine reports as a conflict.
    return {
      id: active.id,
      name: active.name,
      kind: active.kind,
      areaHectares: areaHa,
      availableMW: reconciled.powerConflict
        ? null
        : reconciled.availableMW ?? active.availableMW,
      availableFromDate: reconciled.availableFromDate,
      waterCapLDay: reconciled.waterCapLDay ?? active.waterCapLDay,
      powerConflict: reconciled.powerConflict,
    };
  }, [active, areaHa, reconciled]);

  // Re-assess whenever the brief, site or evidence changes. Stale responses are dropped.
  const runId = useRef(0);
  const lastRun = useRef<{ brief: ProjectBrief; assessment: Assessment } | null>(null);
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
        // Deltas are computed against the previous run held in a ref, never
        // inside a state updater — updaters run during render and must be pure.
        const prev = lastRun.current;
        const sameSite = prev?.assessment.siteId === d.assessment.siteId;
        setDeltas(sameSite && prev ? diff(prev.assessment, d.assessment) : []);
        setAssessment(d.assessment);
        setContext(d.context);

        const movedCriteria =
          !prev || !sameSite || JSON.stringify(prev.assessment.criteria) !== JSON.stringify(d.assessment.criteria);
        const movedBrief = !prev || JSON.stringify(prev.brief) !== JSON.stringify(brief);
        if (movedCriteria || movedBrief) {
          const label = sameSite && prev ? describeChange(prev.brief, brief) : `${site.name} — initial run`;
          setHistory((h) =>
            appendRun(h, { at: new Date().toISOString(), siteId: d.assessment.siteId, label, brief, assessment: d.assessment })
          );
          lastRun.current = { brief, assessment: d.assessment };
        }
      })
      .catch(() => {});
  }, [brief, sitePayload, active]);

  const flyNational = () =>
    mapRef.current?.fitBounds(indiaBounds, { padding: 48, duration: 1100 });

  const flyTo = (b: Bookmark) => {
    mapRef.current?.flyTo({ center: b.center, zoom: b.zoom, duration: 1100 });
    if (b.parcelId) selectSite(b.parcelId);
  };

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
        body: JSON.stringify({
          question,
          brief,
          site,
          centroid: centroidOf(active.geometry),
          documents: siteDocs.map((d) => ({
            id: d.meta.id,
            title: d.meta.title,
            origin: d.meta.origin,
            claims: d.claims,
          })),
        }),
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
  }, [brief, active, sitePayload, siteDocs]);

  const handleDraw = useCallback((f: Feature<Polygon> | null) => {
    setDrawing(false);
    setHasGeometry(Boolean(f));
    if (!f) {
      setDrawn(null);
      setGeomError(null);
      setSelectedId((cur) => (cur === "drawn" ? null : cur));
      return;
    }
    const check = validatePolygon(f.geometry, indiaBounds);
    if (!check.ok) {
      // The shape stays on the map so it can be edited rather than silently vanishing.
      setGeomError(check.reason);
      setDrawn(null);
      setSelectedId((cur) => (cur === "drawn" ? null : cur));
      setLeftTab("sites");
      setRailOpen(true);
      return;
    }
    setGeomError(null);
    setDrawn(f);
    selectSite("drawn");
  }, [indiaBounds, selectSite]);

  const startDraw = () => {
    setGeomError(null);
    controls.current?.start();
    setDrawing(true);
  };

  const clearDraw = () => {
    controls.current?.clear();
    setDrawn(null);
    setHasGeometry(false);
    setDrawing(false);
    setGeomError(null);
    setSelectedId((cur) => (cur === "drawn" ? null : cur));
  };

  const importGeoJSON = (text: string) => {
    const poly = parsePolygon(text);
    if (!poly) {
      setGeomError("Could not read a Polygon from that text. Paste a Polygon, Feature or FeatureCollection.");
      return;
    }
    const check = validatePolygon(poly, indiaBounds);
    if (!check.ok) {
      setGeomError(check.reason);
      return;
    }
    setGeomError(null);
    setHasGeometry(true);
    controls.current?.load(poly);
    mapRef.current?.fitBounds(turf.bbox(turf.polygon(poly.coordinates)) as [number, number, number, number], {
      padding: 160,
      duration: 900,
      maxZoom: 14,
    });
  };

  const ingest = useCallback(async (payload: FormData | { title: string; text: string }) => {
    if (!active) return;
    setEvidenceBusy(true);
    setEvidenceError(null);
    try {
      const res =
        payload instanceof FormData
          ? await fetch("/api/evidence", { method: "POST", body: payload })
          : await fetch("/api/evidence", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ siteId: active.id, ...payload }),
            });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not read that document.");
      setDocs((d) => [...d, { meta: data.document, claims: data.claims }]);
      setLeftTab("evidence");
    } catch (e) {
      setEvidenceError(e instanceof Error ? e.message : "Ingestion failed.");
    } finally {
      setEvidenceBusy(false);
    }
  }, [active]);

  const uploadEvidence = (file: File) => {
    if (!active) return;
    const fd = new FormData();
    fd.append("siteId", active.id);
    fd.append("file", file);
    void ingest(fd);
  };

  /** Loads the two synthetic demo documents through the same ingestion path. */
  const loadFixtures = useCallback(async () => {
    if (!active) return;
    setEvidenceBusy(true);
    setEvidenceError(null);
    try {
      for (const [file, title] of [
        ["/data/sample-broker-brief.txt", "Broker brief (synthetic)"],
        ["/data/sample-utility-note.txt", "Utility note (synthetic)"],
      ] as const) {
        const text = await fetch(file).then((r) => r.text());
        const res = await fetch("/api/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: active.id, title, text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Could not load the demo documents.");
        setDocs((d) => [...d, { meta: { ...data.document, origin: "fixture" }, claims: data.claims }]);
      }
      setLeftTab("evidence");
    } catch (e) {
      setEvidenceError(e instanceof Error ? e.message : "Could not load the demo documents.");
    } finally {
      setEvidenceBusy(false);
    }
  }, [active]);

  const openReport = () => {
    if (!assessment || !active) return;
    const key = stashReport({
      generatedAt: new Date().toISOString(),
      siteName: active.name,
      siteKind: active.kind,
      areaHectares: areaHa,
      brief,
      assessment,
      history: history.map((r) => ({ version: r.version, label: r.label, at: r.at })),
      documents: siteDocs.map((d) => ({ title: d.meta.title, origin: d.meta.origin, claims: d.claims })),
      context,
      sources: SOURCES_PUBLIC,
    });
    window.open(`/report?k=${encodeURIComponent(key)}`, "_blank", "noopener");
  };

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
      evidence: siteDocs.map((d) => ({ ...d.meta, claims: d.claims })),
      history: history.map((r) => ({ version: r.version, label: r.label, at: r.at })),
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
      if (e.key !== "Escape") return;
      if (controls.current?.cancel()) { setDrawing(false); return; }
      if (geomError) { setGeomError(null); return; }
      if (showCompare) { setShowCompare(false); return; }
      setSelectedId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [geomError, showCompare]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-bg">
      <AtlasCanvas
        onReady={(m) => { mapRef.current = m; }}
        onControls={(c) => { controls.current = c; }}
        onDraw={handleDraw}
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
          </div>
          <p className="mt-0.5 text-[10.5px] text-muted">
            Before you build an AI factory, prove the site can support it.
          </p>
        </div>

        <div className="glass pointer-events-auto flex min-w-0 max-w-[calc(100vw-24px)] items-center gap-1 rounded-panel p-1">
          <button
            onClick={() => setRailOpen((v) => !v)}
            aria-expanded={railOpen}
            aria-label={railOpen ? "Hide project panel" : "Show project panel"}
            className="shrink-0 rounded-[6px] px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:bg-white/[.07] hover:text-ink"
          >
            {railOpen ? "◀ Panel" : "▶ Panel"}
          </button>
          <span className="mx-1 h-4 w-px shrink-0 bg-white/10" />
          {/* Regional anchors scroll rather than pushing the actions off-screen. */}
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          <button
            onClick={flyNational}
            className="shrink-0 rounded-[6px] px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:bg-white/[.07] hover:text-ink"
          >
            India
          </button>
          {bookmarks.map((b) => (
            <button
              key={b.id}
              onClick={() => flyTo(b)}
              title={b.parcelId ? `Frames parcel ${b.parcelId}` : "Regional climate anchor"}
              className="hidden shrink-0 rounded-[6px] px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:bg-white/[.07] hover:text-ink sm:block"
            >
              {b.name}
            </button>
          ))}
          </div>
          <span className="mx-1 hidden h-4 w-px shrink-0 bg-white/10 lg:block" />
          <div className="hidden shrink-0 lg:block">
          <PlaceSearch
            onPick={(pl) => mapRef.current?.flyTo({ center: pl.center, zoom: 11, duration: 1100 })}
          />
          </div>
          <span className="mx-1 h-4 w-px shrink-0 bg-white/10" />
          <button
            onClick={openReport}
            disabled={!assessment}
            className="shrink-0 rounded-[6px] px-2.5 py-1.5 text-[11px] font-semibold text-active transition hover:bg-active/10 disabled:opacity-30"
          >
            Report
          </button>
          <button
            onClick={exportBrief}
            disabled={!assessment}
            className="shrink-0 rounded-[6px] px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:bg-white/[.07] hover:text-ink disabled:opacity-30"
          >
            JSON
          </button>
        </div>
      </header>

      {/* Left rail */}
      <aside
        hidden={!railOpen}
        className="glass absolute left-3 top-[86px] z-20 w-[262px] overflow-hidden rounded-panel"
      >
        <div className="flex border-b hairline border-b">
          {(["sites", "brief", "evidence", "layers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setLeftTab(t)}
              aria-pressed={leftTab === t}
              className={`flex-1 px-1.5 py-2 text-[10px] font-semibold uppercase tracking-[.08em] transition ${
                leftTab === t ? "text-active" : "text-muted hover:text-ink"
              }`}
            >
              {t === "sites" ? "Sites" : t === "brief" ? "Project" : t === "evidence" ? `Docs${docs.length ? ` ${docs.length}` : ""}` : "Layers"}
            </button>
          ))}
        </div>

        {leftTab === "sites" ? (
          <SitesPanel
            rows={[
              ...sites.map((x) => ({
                id: x.id,
                name: x.name,
                kind: x.kind,
                areaHa: hectares(x.geometry),
              })),
              ...(drawn
                ? [{ id: "drawn", name: "Drawn polygon", kind: "user-drawn", areaHa: hectares(drawn.geometry) }]
                : []),
            ]}
            selectedId={selectedId}
            onSelect={selectSite}
            onDraw={startDraw}
            onClear={clearDraw}
            onImport={importGeoJSON}
            drawing={drawing}
            hasDrawn={hasGeometry}
            error={geomError}
          />
        ) : leftTab === "brief" ? (
          <BriefSheet brief={brief} onChange={setBrief} onPreset={(m) => setBrief(PRESETS[m])} />
        ) : leftTab === "evidence" ? (
          <EvidencePanel
            docs={siteDocs}
            siteId={active?.id ?? null}
            siteName={active?.name ?? ""}
            busy={evidenceBusy}
            error={evidenceError}
            onUpload={uploadEvidence}
            onPaste={(title, text) => void ingest({ title, text })}
            onRemove={(id) => setDocs((d) => d.filter((x) => x.meta.id !== id))}
            onLoadFixtures={loadFixtures}
            fixturesLoaded={siteDocs.some((d) => d.meta.origin === "fixture")}
          />
        ) : (
          <LayerLegend layers={layers} onToggle={(k, v) => setLayers((p) => ({ ...p, [k]: v }))} />
        )}
      </aside>

      {/* Scenario history */}
      <div hidden={!railOpen} className="glass absolute bottom-3 left-3 z-20 w-[262px] rounded-panel p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted">Scenario runs</h3>
          <span className="tabular text-[10px] text-muted">{history.length}</span>
        </div>
        {history.length === 0 ? (
          <p className="text-[10.5px] leading-snug text-muted/80">
            Change an assumption or ingest a document to create a versioned run.
          </p>
        ) : (
          <>
            <ol className="max-h-[92px] space-y-0.5 overflow-y-auto">
              {[...history].reverse().map((r) => (
                <li key={r.version} className="flex gap-1.5 text-[10.5px] leading-snug">
                  <span className="tabular shrink-0 text-active">v{r.version}</span>
                  <span className="truncate text-muted" title={r.label}>{r.label}</span>
                </li>
              ))}
            </ol>
            {deltas.length > 0 && (
              <div className="mt-2 border-t hairline border-t pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-caution">
                  {deltas.length} finding{deltas.length > 1 ? "s" : ""} changed
                </p>
                {deltas.slice(0, 3).map((d) => (
                  <p key={d.criterionId} className="mt-0.5 text-[10px] leading-snug text-muted">
                    {d.label}: <span className="text-muted/80">{STATE_WORDS[d.from]}</span> →{" "}
                    <span className="text-ink">{STATE_WORDS[d.to]}</span>
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        <p className="mt-2 border-t hairline border-t pt-1.5 text-[10px] leading-snug text-muted/75">
          Earlier runs are preserved; a change creates a version rather than rewriting one.
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

      {/* Drawing is reachable from the map itself, not only the collapsible rail. */}
      <div className="absolute left-1/2 top-[86px] z-20 -translate-x-1/2">
        <button
          onClick={drawing ? clearDraw : startDraw}
          aria-pressed={drawing}
          className={`glass rounded-panel px-3.5 py-2 text-[12px] font-semibold shadow-lg transition ${
            drawing ? "text-active ring-1 ring-active/40" : "text-ink hover:text-active"
          }`}
        >
          {drawing ? "Cancel drawing" : "✎ Draw a site"}
        </button>
      </div>

      {drawing && (
        <div className="glass pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-panel px-4 py-2.5">
          <p className="text-[11.5px] text-ink">
            Click to place each corner · <span className="text-muted">double-click to finish</span> ·{" "}
            <span className="text-muted">Escape cancels</span>
          </p>
        </div>
      )}

      {!selectedId && !drawing && (
        <div className="glass pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-panel px-4 py-2.5">
          <p className="text-[11.5px] text-muted">
            Click a candidate parcel, or use <span className="text-ink">Draw a site</span> above.
          </p>
        </div>
      )}
    </main>
  );
}
