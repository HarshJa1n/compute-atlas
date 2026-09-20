"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import type { Map as MLMap } from "maplibre-gl";
import { PRESETS, diffAssessments, type Assessment, type ProjectBrief } from "@/lib/analysis/evaluate";
import type { Claim, EvidenceDoc } from "@/lib/analysis/evidence";
import type { GeoContext } from "@/lib/analysis/site";
import { appendRun, describeChange, type Run } from "@/lib/analysis/scenario";
import { EVIDENCE_LIMITS } from "@/lib/contracts";
import { buildReportHtml } from "@/lib/report";
import SiteDossier from "@/components/panels/SiteDossier";
import Investigation, { type Evt } from "@/components/panels/Investigation";
import BriefSheet from "@/components/panels/BriefSheet";
import CompareTray from "@/components/panels/CompareTray";
import SitesPanel from "@/components/panels/SitesPanel";
import EvidencePanel, { type Fixture } from "@/components/panels/EvidencePanel";
import LayerLegend from "@/components/panels/LayerLegend";
import PlaceSearch from "@/components/panels/PlaceSearch";
import type { Delta, ScenarioResult } from "@/components/panels/Changes";
import { Mark, btn } from "@/components/panels/ui";
import { parsePolygon, validatePolygon } from "@/lib/analysis/geometry";
import type { Bookmark } from "@/lib/data";
import DemoStrip, { type DemoAction } from "./DemoStrip";
import FocusLayer from "./FocusLayer";
import Tour, { TOUR_STEPS, type TourStep } from "./Tour";
import type { DrawControls, Focus, Layers } from "./AtlasCanvas";

const AtlasCanvas = dynamic(() => import("./AtlasCanvas"), { ssr: false });

export type DemoSite = {
  id: string; name: string; kind: string; notice: string;
  geometry: Polygon; availableMW: number | null; waterCapLDay: number | null;
};

type Source = { id: string; name: string; url: string; scale: string; kind: string };

const hectares = (g: Polygon) => turf.area(turf.polygon(g.coordinates)) / 10_000;
const centroidOf = (g: Polygon) => turf.centroid(turf.polygon(g.coordinates)).geometry.coordinates as [number, number];
const bboxOf = (g: Polygon) => turf.bbox(turf.polygon(g.coordinates)) as [number, number, number, number];

const DEFAULT_QUESTION = "Assess this site against the current brief and tell me what remains unproven.";
const WHATIF_QUESTION = "What if we cut the IT load to 10 MW and move to dry cooling at WUE 0.1? Test that scenario and tell me exactly which criteria move and which do not.";
const COMPARE_QUESTION = "Compare this parcel with B and C on the current brief. Which unresolved item would change the shortlist?";

export default function Atlas({
  sites, bookmarks, indiaBounds, fixtures, sources,
}: {
  sites: DemoSite[];
  bookmarks: Bookmark[];
  indiaBounds: [number, number, number, number];
  fixtures: Fixture[];
  sources: Source[];
}) {
  const mapRef = useRef<MLMap | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const controls = useRef<DrawControls | null>(null);

  const [brief, setBrief] = useState<ProjectBrief>(PRESETS.campus);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<Feature<Polygon> | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [context, setContext] = useState<GeoContext | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [events, setEvents] = useState<Evt[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"live" | "recorded" | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({ states: true, facilities: true, candidates: true, power: true });
  const [evidence, setEvidence] = useState<EvidenceDoc[]>([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [compare, setCompare] = useState<Array<{ id: string; name: string; assessment: Assessment }>>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [leftTab, setLeftTab] = useState<"sites" | "brief" | "evidence" | "layers">("sites");
  const [drawing, setDrawing] = useState(false);
  const [geomError, setGeomError] = useState<string | null>(null);
  const [hasGeometry, setHasGeometry] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [present, setPresent] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [invCollapsed, setInvCollapsed] = useState(false);

  // A side panel brought to the centre. `from` is the slot it grew out of, for the FLIP.
  const [focused, setFocused] = useState<{ which: "dossier" | "investigation"; from: DOMRect | null } | null>(null);
  const [focusOpen, setFocusOpen] = useState(true);
  const dossierSlot = useRef<HTMLDivElement>(null);
  const investigationSlot = useRef<HTMLDivElement>(null);

  // Change tracking: what moved, why, which criteria to flash, and a versioned history.
  const [delta, setDelta] = useState<Delta | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<Run[]>([]);
  const prevRef = useRef<{ siteId: string; brief: ProjectBrief; assessment: Assessment } | null>(null);
  const reasonRef = useRef<string | null>(null);

  // Agent side effects.
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);

  // Investigation staleness: the inputs at the time of the last run.
  const [askedKey, setAskedKey] = useState<string | null>(null);
  const lastQuestion = useRef<string>(DEFAULT_QUESTION);

  // Opening tour.
  const [tour, setTour] = useState<TourStep | null>(null);
  const tourTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const apply = () => setRailOpen(window.innerWidth >= 1200);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const candidates = useMemo(() => sites.map((s) => ({ id: s.id, name: `Parcel ${s.id}`, geometry: s.geometry })), [sites]);

  const active = useMemo(() => {
    if (selectedId === "drawn" && drawn) {
      return { id: "drawn", name: "Drawn polygon", kind: "user-drawn", notice: "", geometry: drawn.geometry, availableMW: null, waterCapLDay: null } as DemoSite;
    }
    return sites.find((s) => s.id === selectedId) ?? null;
  }, [selectedId, sites, drawn]);

  const areaHa = active ? hectares(active.geometry) : null;
  const siteDocs = useMemo(() => (active ? evidence.filter((d) => d.siteId === active.id) : []), [evidence, active]);

  const sitePayload = useCallback(() => {
    if (!active) return null;
    return { id: active.id, name: active.name, kind: active.kind, areaHectares: areaHa, availableMW: active.availableMW, waterCapLDay: active.waterCapLDay };
  }, [active, areaHa]);

  const inputKey = useMemo(
    () => JSON.stringify({ brief, siteId: active?.id ?? null, docs: siteDocs.map((d) => d.id).sort() }),
    [brief, active, siteDocs]
  );
  const stale = events.length > 0 && askedKey !== null && askedKey !== inputKey;

  // Re-assess whenever the brief, site or evidence changes. Stale responses are dropped.
  const runId = useRef(0);
  useEffect(() => {
    const site = sitePayload();
    if (!site || !active) { setAssessment(null); setContext(null); setClaims([]); return; }
    const id = ++runId.current;
    fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, site, centroid: centroidOf(active.geometry), evidence }),
    })
      .then((r) => r.json())
      .then((d: { assessment: Assessment; context: GeoContext; claims: Claim[] }) => {
        if (id !== runId.current) return;
        const prev = prevRef.current;
        const sameSite = prev?.siteId === active.id;
        let label = `${active.name} · initial run`;
        if (prev && sameSite) {
          const diff = diffAssessments(prev.assessment, d.assessment);
          const reason = reasonRef.current ?? (JSON.stringify(prev.brief) !== JSON.stringify(brief) ? describeChange(prev.brief, brief) : "Inputs changed");
          label = reason;
          if (diff.criteria.length || diff.quantities.length) {
            setDelta({ ...diff, reason, at: Date.now() });
            setChanged(new Set(diff.criteria.map((c) => c.id)));
          }
        }
        const moved = !prev || !sameSite || JSON.stringify(prev.assessment.criteria) !== JSON.stringify(d.assessment.criteria) || JSON.stringify(prev.brief) !== JSON.stringify(brief);
        if (moved) {
          setHistory((h) => appendRun(h, { at: new Date().toISOString(), siteId: active.id, label, brief, assessment: d.assessment }));
        }
        prevRef.current = { siteId: active.id, brief, assessment: d.assessment };
        reasonRef.current = null;
        setAssessment(d.assessment);
        setContext(d.context);
        setClaims(d.claims ?? []);
      })
      .catch(() => {});
  }, [brief, sitePayload, active, evidence]);

  useEffect(() => {
    if (!changed.size) return;
    const t = setTimeout(() => setChanged(new Set()), 2400);
    return () => clearTimeout(t);
  }, [changed]);

  const flyNational = useCallback(() => mapRef.current?.fitBounds(indiaBounds, { padding: 48, duration: 1100, pitch: 0 }), [indiaBounds]);

  const selectSite = useCallback((id: string, fly = true) => {
    setSelectedId(id);
    setEvents([]); setMode(null); setAskedKey(null); setScenario(null); setDelta(null);
    const geom = id === "drawn" ? drawn?.geometry : sites.find((s) => s.id === id)?.geometry;
    if (geom && fly) mapRef.current?.fitBounds(bboxOf(geom), { padding: 160, duration: 900, maxZoom: 13.5, pitch: 0 });
  }, [sites, drawn]);

  const flyTo = (b: Bookmark) => {
    mapRef.current?.flyTo({ center: b.center, zoom: b.zoom, duration: 1100, pitch: 0 });
    if (b.parcelId) selectSite(b.parcelId);
  };

  // --- Evidence -----------------------------------------------------------
  const addEvidence = useCallback((doc: Omit<EvidenceDoc, "siteId">) => {
    if (!active) return;
    setEvidence((p) => {
      if (p.some((d) => d.id === doc.id) || p.length >= EVIDENCE_LIMITS.maxDocs) return p;
      return [...p, { ...doc, siteId: active.id }];
    });
    reasonRef.current = `${doc.title} ingested`;
  }, [active]);

  const removeEvidence = (id: string) => {
    const doc = evidence.find((d) => d.id === id);
    reasonRef.current = doc ? `${doc.title} removed` : "Document removed";
    setEvidence((p) => p.filter((d) => d.id !== id));
  };

  const ingestFixture = useCallback((fixtureId: string) => {
    const f = fixtures.find((x) => x.id === fixtureId);
    if (f) addEvidence({ id: f.id, title: f.title, text: f.text, origin: "fixture" });
  }, [fixtures, addEvidence]);

  /** Files go through the server for text extraction (PDF); the returned text is then held like any pasted document. */
  const uploadEvidence = useCallback(async (file: File) => {
    if (!active) return;
    setEvidenceBusy(true); setEvidenceError(null);
    try {
      const fd = new FormData();
      fd.append("siteId", active.id);
      fd.append("file", file);
      const res = await fetch("/api/evidence", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not read that document.");
      const doc = data.document as EvidenceDoc;
      addEvidence({ id: doc.id, title: doc.title, text: doc.text, origin: "upload" });
      if (data.truncated) setEvidenceError(`Only the first ${EVIDENCE_LIMITS.maxChars.toLocaleString("en-IN")} characters were kept.`);
    } catch (e) {
      setEvidenceError(e instanceof Error ? e.message : "Ingestion failed.");
    } finally {
      setEvidenceBusy(false);
    }
  }, [active, addEvidence]);

  // --- Investigation ------------------------------------------------------
  const ask = useCallback(async (question: string) => {
    const site = sitePayload();
    if (!site || !active) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    lastQuestion.current = question;
    setInvCollapsed(false);
    setBusy(true);
    setEvents([]);
    setScenario(null);
    setAskedKey(inputKey);

    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, brief, site, centroid: centroidOf(active.geometry), evidence }),
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
          if (evt.type === "mode") { setMode(evt.mode); setModel(evt.model ?? null); continue; }
          if (evt.type === "done") continue;
          if (evt.type === "tool" && evt.status === "ok" && evt.result && typeof evt.result === "object" && "data" in evt.result) {
            // Tool results that touch the UI. The server validated the arguments; the client only renders.
            const data = (evt.result as { data: unknown }).data as Record<string, unknown>;
            if (evt.name === "focusMap" && Array.isArray(data.center)) {
              setFocus({ center: data.center as [number, number], zoom: Number(data.zoom), label: String(data.label ?? ""), at: Date.now() });
            } else if (evt.name === "testScenario" && data.deltas) {
              setScenario(data as unknown as ScenarioResult);
            } else if (evt.name === "compareSites" && Array.isArray(data.rows)) {
              setCompare((data.rows as Array<{ id: string; name: string; assessment: Assessment }>).slice(0, 3));
              setShowCompare(true);
            }
          }
          setEvents((p) => [...p, evt]);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setEvents((p) => [...p, { type: "notice", text: "Investigation failed. Computed results above are unchanged." }]);
      }
    } finally {
      setBusy(false);
    }
  }, [brief, active, sitePayload, evidence, inputKey]);

  const applyScenario = () => {
    if (!scenario) return;
    reasonRef.current = `Scenario applied: ${scenario.label}`;
    setBrief((b) => ({ ...b, ...(scenario.changes as Partial<ProjectBrief>) }));
    setScenario(null);
  };

  const expandPanel = useCallback((which: "dossier" | "investigation") => {
    if (focused) { setFocusOpen(false); return; }
    const slot = which === "dossier" ? dossierSlot.current : investigationSlot.current;
    setFocused({ which, from: slot?.getBoundingClientRect() ?? null });
    setFocusOpen(true);
  }, [focused]);
  const closeFocus = useCallback(() => { if (focused) setFocusOpen(false); }, [focused]);

  // Deselecting the site leaves nothing to show in a focused dossier.
  useEffect(() => { if (!active && focused) setFocusOpen(false); }, [active, focused]);

  const focusOn = (target: "facility" | "substation") => {
    if (!context) return;
    if (target === "facility" && context.nearestFacility) {
      const f = context.nearestFacility;
      setFocus({ center: [f.lon, f.lat], zoom: 11.5, label: `${f.name} · ${f.km} km`, at: Date.now() });
    }
    if (target === "substation" && context.power.nearestSubstation) {
      const s = context.power.nearestSubstation;
      setFocus({ center: [s.lon, s.lat], zoom: 12.5, label: `${s.name ?? "Substation"}${s.kV ? ` · ${s.kV} kV` : ""} · ${s.km} km`, at: Date.now() });
    }
  };

  // --- Drawing ------------------------------------------------------------
  const handleDraw = useCallback((f: Feature<Polygon> | null) => {
    setDrawing(false);
    setHasGeometry(Boolean(f));
    if (!f) { setDrawn(null); setGeomError(null); setSelectedId((cur) => (cur === "drawn" ? null : cur)); return; }
    const check = validatePolygon(f.geometry, indiaBounds);
    if (!check.ok) {
      setGeomError(check.reason); setDrawn(null);
      setSelectedId((cur) => (cur === "drawn" ? null : cur));
      setLeftTab("sites"); setRailOpen(true);
      return;
    }
    setGeomError(null);
    setDrawn(f);
    selectSite("drawn");
  }, [indiaBounds, selectSite]);

  const startDraw = () => { setGeomError(null); controls.current?.start(); setDrawing(true); };
  const clearDraw = () => {
    controls.current?.clear(); setDrawn(null); setHasGeometry(false); setDrawing(false); setGeomError(null);
    setSelectedId((cur) => (cur === "drawn" ? null : cur));
  };
  const importGeoJSON = (text: string) => {
    const poly = parsePolygon(text);
    if (!poly) { setGeomError("Could not read a Polygon from that text. Paste a Polygon, Feature or FeatureCollection."); return; }
    const check = validatePolygon(poly, indiaBounds);
    if (!check.ok) { setGeomError(check.reason); return; }
    setGeomError(null); setHasGeometry(true);
    controls.current?.load(poly);
    mapRef.current?.fitBounds(bboxOf(poly), { padding: 160, duration: 900, maxZoom: 14 });
  };

  // --- Compare & export ---------------------------------------------------
  const addToCompare = () => {
    if (!active || !assessment) return;
    setCompare((p) => (p.some((x) => x.id === active.id) ? p : [...p, { id: active.id, name: active.name, assessment }].slice(-3)));
    setShowCompare(true);
  };

  const narrative = () => events.filter((e): e is Extract<Evt, { type: "text" }> => e.type === "text").map((e) => e.text);

  const exportJSON = () => {
    const payload = {
      exportedAt: new Date().toISOString(), brief, site: sitePayload(), assessment, context, claims,
      evidence: siteDocs.map((d) => ({ id: d.id, title: d.title, origin: d.origin, chars: d.text.length })),
      history: history.map((r) => ({ version: r.version, label: r.label, at: r.at })),
      investigation: { mode, model, narrative: narrative() },
      notice: "Screening export. Synthetic parcels and documents are labelled. Not an engineering or legal opinion.",
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `compute-atlas-${active?.id ?? "site"}.json`; a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const exportReport = () => {
    if (!active || !assessment) return;
    const html = buildReportHtml({
      brief, site: { id: active.id, name: active.name, kind: active.kind, areaHectares: areaHa }, assessment,
      evidence: siteDocs, claims, narrative: narrative(), investigationMode: mode, model, sources, context,
    });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setExportOpen(false);
  };

  // --- Demo controls & tour ----------------------------------------------
  const stopTour = useCallback(() => {
    tourTimers.current.forEach(clearTimeout);
    tourTimers.current = [];
    setTour(null);
    mapRef.current?.easeTo({ pitch: 0, duration: 600 });
  }, []);

  const resetDemo = useCallback(() => {
    abortRef.current?.abort();
    stopTour();
    controls.current?.clear();
    setBrief(PRESETS.campus); setSelectedId(null); setDrawn(null); setHasGeometry(false); setDrawing(false); setGeomError(null);
    setEvidence([]); setEvidenceError(null); setCompare([]); setShowCompare(false); setEvents([]); setMode(null); setScenario(null); setDelta(null);
    setHistory([]); setAskedKey(null); setLeftTab("sites"); setExportOpen(false);
    prevRef.current = null; reasonRef.current = null;
    flyNational();
  }, [flyNational, stopTour]);

  const startTour = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    tourTimers.current.forEach(clearTimeout);
    tourTimers.current = [];
    const parcel = sites.find((s) => s.id === "A") ?? sites[0];
    const t = (ms: number, fn: () => void) => tourTimers.current.push(setTimeout(fn, ms));
    const [d0, d1, d2] = TOUR_STEPS.map((s) => s.ms);

    setSelectedId(null);
    setTour(0);
    map.stop();
    // 1. A slow settle over the whole country.
    map.jumpTo({ center: [80.5, 21.5], zoom: 3.2, pitch: 0 });
    map.easeTo({ center: [79.8, 22.2], zoom: 3.9, duration: d0, easing: (x) => 1 - Math.pow(1 - x, 3) });
    // 2. Sweep into central India with a little pitch so the grid lines read as infrastructure.
    t(d0, () => { setTour(1); map.flyTo({ center: [77.9, 22.3], zoom: 6.4, pitch: 30, duration: d1 - 200, essential: true }); });
    // 3. Land on the parcel, then level out and select it.
    t(d0 + d1, () => {
      setTour(2);
      if (parcel) map.flyTo({ center: centroidOf(parcel.geometry), zoom: 13.2, pitch: 40, duration: d2 - 400, essential: true });
    });
    t(d0 + d1 + d2, () => {
      setTour(null);
      map.easeTo({ pitch: 0, duration: 700 });
      if (parcel) selectSite(parcel.id, false);
    });
  }, [sites, selectSite]);

  const onMapReady = useCallback((m: MLMap) => {
    mapRef.current = m;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const skip = new URLSearchParams(window.location.search).has("notour");
    if (!reduced && !skip) setTimeout(startTour, 300);
  }, [startTour]);

  const onInteract = useCallback(() => { if (tour !== null) stopTour(); }, [tour, stopTour]);

  const bhopal = bookmarks.find((b) => b.parcelId === "A") ?? bookmarks[0];
  const demoActions: DemoAction[] = [
    { key: "1", label: "Reset", run: resetDemo, hint: "Clear evidence, brief and selection" },
    { key: "2", label: "India", run: flyNational },
    { key: "3", label: "Parcel A", run: () => bhopal && flyTo(bhopal), active: selectedId === "A" },
    { key: "4", label: "Investigate", run: () => ask(DEFAULT_QUESTION), disabled: !active || busy },
    { key: "5", label: "Broker brief", run: () => ingestFixture("demo-broker-A"), disabled: active?.id !== "A", active: evidence.some((d) => d.id === "demo-broker-A") },
    { key: "6", label: "Utility note", run: () => ingestFixture("demo-utility-A"), disabled: active?.id !== "A", active: evidence.some((d) => d.id === "demo-utility-A") },
    { key: "7", label: brief.mode === "campus" ? "Modular" : "Campus", run: () => { reasonRef.current = `Switched to ${brief.mode === "campus" ? "modular" : "campus"} preset`; setBrief(PRESETS[brief.mode === "campus" ? "modular" : "campus"]); } },
    { key: "8", label: "What-if", run: () => ask(WHATIF_QUESTION), disabled: !active || busy, hint: "Agent tests a smaller, dry-cooled build against the same facts" },
    { key: "9", label: "Compare", run: () => ask(COMPARE_QUESTION), disabled: !active || busy, hint: "Agent compares with B and C" },
    { key: "0", label: "Report", run: exportReport, disabled: !assessment },
    { key: "", label: "Seller note", run: () => ingestFixture("demo-adversarial-A"), disabled: active?.id !== "A", active: evidence.some((d) => d.id === "demo-adversarial-A"), hint: "A document with instruction-like text" },
  ];

  // Keyboard: Escape unwinds state; digits drive the demo strip when presenting.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "Escape") {
        if (tour !== null) { stopTour(); return; }
        if (focused) { closeFocus(); return; }
        if (controls.current?.cancel()) { setDrawing(false); return; }
        if (exportOpen) { setExportOpen(false); return; }
        if (geomError) { setGeomError(null); return; }
        if (showCompare) { setShowCompare(false); return; }
        if (present) { setPresent(false); return; }
        if (!typing) setSelectedId(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (tour !== null && e.key !== "Tab") { stopTour(); return; }
      if (present && /^[0-9]$/.test(e.key)) {
        const a = demoActions.find((x) => x.key === e.key);
        if (a && !a.disabled) { e.preventDefault(); a.run(); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const dossierEl = (expanded: boolean) => (
    <SiteDossier
      name={active?.name ?? ""}
      kind={active?.kind ?? ""}
      notice={active?.notice}
      areaHa={areaHa}
      assessment={assessment}
      context={context}
      onInvestigate={() => ask(DEFAULT_QUESTION)}
      onCompare={addToCompare}
      busy={busy}
      changed={changed}
      delta={delta}
      onDismissDelta={() => setDelta(null)}
      scenario={scenario}
      onApplyScenario={applyScenario}
      onDismissScenario={() => setScenario(null)}
      onFocus={focusOn}
      onExpand={assessment ? () => expandPanel("dossier") : undefined}
      expanded={expanded}
    />
  );
  const investigationEl = (expanded: boolean) => (
    <Investigation
      collapsed={expanded ? false : invCollapsed}
      onToggle={() => setInvCollapsed((v) => !v)}
      events={events}
      busy={busy}
      mode={mode}
      model={model}
      onAsk={ask}
      onCancel={() => abortRef.current?.abort()}
      disabled={!active}
      stale={stale}
      onRerun={() => ask(lastQuestion.current)}
      hasDocs={siteDocs.length > 0}
      onExpand={() => expandPanel("investigation")}
      expanded={expanded}
    />
  );
  const tabs = ["sites", "brief", "evidence", "layers"] as const;
  const tabIndex = tabs.indexOf(leftTab);

  const rightW = present ? 368 * 1.3 + 12 * 1.3 : 368;
  const leftW = present ? 262 * 1.3 + 12 * 1.3 : 262;
  const touring = tour !== null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-bg" data-present={present ? "true" : "false"} data-tour={touring ? "true" : "false"}>
      <AtlasCanvas
        onReady={onMapReady}
        onControls={(c) => { controls.current = c; }}
        onDraw={handleDraw}
        onSelectSite={(id) => { stopTour(); selectSite(id); }}
        onInteract={onInteract}
        candidates={candidates}
        selectedId={selectedId}
        layers={layers}
        focus={focus}
      />

      {tour !== null && <Tour step={tour} onSkip={stopTour} />}

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
        <div className="glass zoomable pointer-events-auto flex items-center gap-3 rounded-panel px-3.5 py-2.5">
          <Mark className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-[13.5px] font-semibold tracking-tight text-ink">Compute Atlas</h1>
            <p className="text-[10.5px] text-muted">Prove the site before you build.</p>
          </div>
        </div>

        <div className="tour-hide glass zoomable pointer-events-auto relative flex max-w-[calc(100vw-220px)] items-center gap-0.5 rounded-panel p-1">
          <button onClick={() => setRailOpen((v) => !v)} aria-expanded={railOpen} aria-label={railOpen ? "Hide project panel" : "Show project panel"} className={btn.toolbar}>
            {railOpen ? "◂ Panel" : "▸ Panel"}
          </button>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            <button onClick={flyNational} className={`${btn.toolbar} shrink-0`}>India</button>
            {!present && bookmarks.map((b) => (
              <button key={b.id} onClick={() => flyTo(b)} title={b.parcelId ? `Frames parcel ${b.parcelId}` : "Regional climate anchor"} className={`${btn.toolbar} hidden shrink-0 sm:block`}>
                {b.name}
              </button>
            ))}
          </div>
          {!present && (
            <>
              <span className="mx-1 hidden h-4 w-px bg-white/10 lg:block" />
              <div className="hidden shrink-0 lg:block">
                <PlaceSearch onPick={(pl) => mapRef.current?.flyTo({ center: pl.center, zoom: 11, duration: 1100 })} />
              </div>
            </>
          )}
          <span className="mx-1 h-4 w-px bg-white/10" />
          <button onClick={startTour} className={btn.toolbar}>Tour</button>
          <button onClick={() => setPresent((v) => !v)} aria-pressed={present} className={`rounded-[7px] px-2.5 py-1.5 text-[11.5px] font-semibold transition ${present ? "bg-brand/15 text-brand" : "text-muted hover:bg-white/[.07] hover:text-ink"}`}>
            {present ? "Presenting" : "Present"}
          </button>
          <button onClick={() => setExportOpen((v) => !v)} disabled={!assessment} aria-expanded={exportOpen} className="rounded-[7px] bg-brand px-3 py-1.5 text-[11.5px] font-semibold text-bg transition hover:brightness-110 disabled:opacity-30">
            Export
          </button>
          {exportOpen && (
            <div className="glass enter-pop absolute right-1 top-full mt-1.5 flex w-[230px] origin-top-right flex-col rounded-panel p-1">
              <button onClick={exportReport} className="rounded-[9px] px-3 py-2 text-left text-[12px] text-ink hover:bg-white/[.07]">
                <span className="block font-medium">Open report</span>
                <span className="block text-[10.5px] text-muted">Readable evidence pack, printable to PDF</span>
              </button>
              <button onClick={exportJSON} className="rounded-[9px] px-3 py-2 text-left text-[12px] text-ink hover:bg-white/[.07]">
                <span className="block font-medium">Download JSON</span>
                <span className="block text-[10.5px] text-muted">Inputs, verdicts, claims, history, versions</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Draw is reachable from the map itself, not only the collapsible rail. */}
      {!present && (
        <div className="tour-hide absolute left-1/2 top-[86px] z-20 -translate-x-1/2">
          <button
            onClick={drawing ? clearDraw : startDraw}
            aria-pressed={drawing}
            className={`glass rounded-full px-4 py-2 text-[12px] font-semibold transition ${drawing ? "text-brand ring-1 ring-brand/40" : "text-ink hover:text-brand"}`}
          >
            {drawing ? "Cancel drawing" : "✎ Draw a site"}
          </button>
        </div>
      )}

      {/* Left rail */}
      <aside hidden={!railOpen} className="tour-hide glass zoomable absolute left-3 top-[86px] z-20 w-[262px] overflow-hidden rounded-panel">
        <div className="relative flex gap-0.5 border-b hairline border-b p-1">
          {/* One pill slides between tabs, so background and label change in sync. */}
          <span
            aria-hidden
            className="tab-pill absolute bottom-1 top-1 rounded-[9px] bg-white/[.07]"
            style={{ width: `calc((100% - 8px - ${(tabs.length - 1) * 2}px) / ${tabs.length})`, left: 4, transform: `translateX(calc(${tabIndex} * (100% + 2px)))` }}
          />
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setLeftTab(t)}
              aria-pressed={leftTab === t}
              className={`relative z-10 flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-[9px] px-1 py-1.5 text-[11px] font-semibold ${leftTab === t ? "text-ink" : "text-muted hover:text-ink"}`}
            >
              {t === "sites" ? "Sites" : t === "brief" ? "Project" : t === "evidence" ? "Evidence" : "Layers"}
              {t === "evidence" && siteDocs.length > 0 && <span className="rounded-full bg-brand/20 px-1.5 font-mono text-[9.5px] text-brand">{siteDocs.length}</span>}
            </button>
          ))}
        </div>

        <div key={leftTab} className="rail-body enter-up-soft overflow-y-auto">
          {leftTab === "sites" ? (
            <SitesPanel
              rows={[
                ...sites.map((x) => ({ id: x.id, name: x.name, kind: x.kind, areaHa: hectares(x.geometry) })),
                ...(drawn ? [{ id: "drawn", name: "Drawn polygon", kind: "user-drawn", areaHa: hectares(drawn.geometry) }] : []),
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
            <BriefSheet
              brief={brief}
              onChange={(b, label) => { reasonRef.current = label; setBrief(b); }}
              onPreset={(m) => { reasonRef.current = `Switched to ${m} preset`; setBrief(PRESETS[m]); }}
            />
          ) : leftTab === "evidence" ? (
            <EvidencePanel
              siteId={active?.id ?? null}
              siteName={active?.name ?? ""}
              docs={siteDocs}
              claims={claims}
              fixtures={fixtures}
              onAdd={addEvidence}
              onRemove={removeEvidence}
              onUpload={(f) => void uploadEvidence(f)}
              busy={evidenceBusy}
              error={evidenceError}
              maxChars={EVIDENCE_LIMITS.maxChars}
            />
          ) : (
            <LayerLegend layers={layers} onToggle={(k, v) => setLayers((p) => ({ ...p, [k]: v }))} />
          )}
        </div>
      </aside>

      {/* Versioned runs */}
      {!present && railOpen && (
        <div className="tour-hide glass absolute bottom-3 left-3 z-20 w-[262px] rounded-panel p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[.16em] text-muted">Runs</h3>
            <span className="font-mono text-[10px] text-muted">{history.length ? `v${history[history.length - 1].version}` : "—"}</span>
          </div>
          {history.length === 0 ? (
            <p className="text-[10.5px] leading-snug text-muted/80">Select a site, change an assumption or ingest a document. Every recompute is a version; nothing is rewritten.</p>
          ) : (
            <ol className="max-h-[84px] space-y-0.5 overflow-y-auto">
              {[...history].reverse().slice(0, 6).map((r) => (
                <li key={r.version} className="flex gap-2 text-[10.5px] leading-snug">
                  <span className="shrink-0 font-mono text-brand">v{r.version}</span>
                  <span className="truncate text-muted" title={r.label}>{r.label}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Right panels */}
      <aside className="tour-hide glass zoomable right-rail absolute right-3 top-[86px] z-20 flex w-[300px] flex-col overflow-hidden rounded-panel lg:w-[340px] xl:w-[368px]">
        <div ref={dossierSlot} className="min-h-0 flex-[3] overflow-hidden border-b hairline border-b">
          {focused?.which === "dossier" ? (
            <SlotPlaceholder label="Dossier" onReturn={closeFocus} />
          ) : (
            dossierEl(false)
          )}
        </div>
        <div ref={investigationSlot} className={invCollapsed && focused?.which !== "investigation" ? "shrink-0" : "min-h-[240px] flex-[2]"}>
          {focused?.which === "investigation" ? (
            <SlotPlaceholder label="Investigation" onReturn={closeFocus} />
          ) : (
            investigationEl(false)
          )}
        </div>
      </aside>

      {focused && (
        <FocusLayer
          open={focusOpen}
          from={focused.from}
          label={focused.which === "dossier" ? "Site dossier, expanded" : "Investigation, expanded"}
          onClosed={() => { setFocused(null); setFocusOpen(true); }}
        >
          {focused.which === "dossier" ? dossierEl(true) : investigationEl(true)}
        </FocusLayer>
      )}

      {showCompare && compare.length > 0 && (
        <div className="absolute z-20" style={{ left: railOpen ? leftW + 24 : 12, right: rightW + 16, bottom: present ? 84 : 12 }}>
          <div className="zoomable enter-up">
            <CompareTray rows={compare} onRemove={(id) => setCompare((p) => p.filter((x) => x.id !== id))} onClose={() => setShowCompare(false)} />
          </div>
        </div>
      )}

      {present && (
        <div className="enter-up pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
          <DemoStrip actions={demoActions} />
        </div>
      )}

      {drawing && (
        <div className="glass pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full px-4 py-2">
          <p className="text-[11.5px] text-ink">Click to place each corner · <span className="text-muted">double-click to finish · Escape cancels</span></p>
        </div>
      )}

      {!selectedId && !present && !drawing && !touring && (
        <div className="glass pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-2">
          <p className="text-[11.5px] text-muted">Click a candidate parcel, or use <span className="text-ink">Draw a site</span> above.</p>
        </div>
      )}
    </main>
  );
}

/** What the side slot shows while its panel is expanded in the centre. */
function SlotPlaceholder({ label, onReturn }: { label: string; onReturn: () => void }) {
  return (
    <button
      onClick={onReturn}
      className="enter-up-soft flex h-full w-full flex-col items-center justify-center gap-1.5 px-6 text-center hover:bg-white/[.03]"
    >
      <span className="font-mono text-[11px] text-muted">⤡</span>
      <span className="text-[12px] font-medium text-ink/80">{label} is expanded</span>
      <span className="text-[10.5px] text-muted">Click here or press Escape to bring it back</span>
    </button>
  );
}
