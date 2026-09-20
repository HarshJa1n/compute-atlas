"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Feature, Polygon } from "geojson";
import { resolveStyle, transformRequest, usingMapbox } from "@/lib/map/mapbox";

export type Layers = { states: boolean; facilities: boolean; candidates: boolean; power: boolean };

/** Our own UI drives drawing; the plugin's control strip is not the only entry point. */
export type DrawControls = {
  start: () => void;
  clear: () => void;
  load: (polygon: Polygon) => void;
  isDrawing: () => boolean;
  cancel: () => boolean;
};

/** A camera target the agent (or the dossier) asked to show, with a labelled pulse marker. */
export type Focus = { center: [number, number]; zoom: number; label: string; at: number };

type Props = {
  onReady: (map: MLMap) => void;
  onControls: (controls: DrawControls) => void;
  onDraw: (feature: Feature<Polygon> | null) => void;
  onSelectSite: (id: string) => void;
  onInteract: () => void;
  candidates: Array<{ id: string; name: string; geometry: Polygon }>;
  selectedId: string | null;
  layers: Layers;
  focus: Focus | null;
};

/**
 * The design spec called for Terra Draw; we use @mapbox/mapbox-gl-draw against
 * MapLibre instead. The plugin predates MapLibre's fork, so its control classes
 * and a couple of runtime hooks need shimming before it will mount.
 */
function makeDraw(): MapboxDraw {
  const C = (MapboxDraw as unknown as { constants: { classes: Record<string, string> } }).constants;
  C.classes.CONTROL_BASE = "maplibregl-ctrl";
  C.classes.CONTROL_PREFIX = "maplibregl-ctrl-";
  C.classes.CONTROL_GROUP = "maplibregl-ctrl-group";

  return new MapboxDraw({
    displayControlsDefault: false,
    controls: { polygon: false, trash: false },
    styles: [
      { id: "gl-draw-polygon-fill", type: "fill", filter: ["all", ["==", "$type", "Polygon"]], paint: { "fill-color": "#8b9eff", "fill-opacity": 0.14 } },
      { id: "gl-draw-polygon-stroke", type: "line", filter: ["all", ["==", "$type", "Polygon"]], paint: { "line-color": "#8b9eff", "line-width": 2 } },
      { id: "gl-draw-vertex", type: "circle", filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]], paint: { "circle-radius": 5, "circle-color": "#0a0d12", "circle-stroke-color": "#8b9eff", "circle-stroke-width": 2 } },
      { id: "gl-draw-midpoint", type: "circle", filter: ["all", ["==", "meta", "midpoint"]], paint: { "circle-radius": 3, "circle-color": "#c98cff" } },
      { id: "gl-draw-line", type: "line", filter: ["all", ["==", "$type", "LineString"]], paint: { "line-color": "#8b9eff", "line-width": 2, "line-dasharray": [0.2, 2] } },
    ],
  });
}

// Voltage classes for the OpenStreetMap power layer. Untagged lines stay muted.
const KV_COLOR: maplibregl.ExpressionSpecification = [
  "case",
  [">=", ["coalesce", ["get", "kV"], 0], 400], "#f472b6",
  [">=", ["coalesce", ["get", "kV"], 0], 220], "#60a5fa",
  [">=", ["coalesce", ["get", "kV"], 0], 100], "#3b82f6",
  "#3a4a5c",
];

export default function AtlasCanvas({ onReady, onControls, onDraw, onSelectSite, onInteract, candidates, selectedId, layers, focus }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const cbs = useRef({ onDraw, onSelectSite, onReady, onControls, onInteract });
  cbs.current = { onDraw, onSelectSite, onReady, onControls, onInteract };

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    let disposed = false;
    const ac = new AbortController();

    (async () => {
    const style = await resolveStyle(ac.signal);
    if (disposed || !el.current) return;

    const map = new maplibregl.Map({
      container: el.current,
      style,
      transformRequest,
      center: [79.5, 22.6],
      zoom: 3.7,
      attributionControl: false,
      dragRotate: false,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: `${usingMapbox() ? "© Mapbox" : "© CARTO"} © OpenStreetMap contributors · PeeringDB · NASA POWER`,
      }),
      "bottom-right"
    );
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // Any deliberate interaction cancels the opening tour.
    for (const ev of ["mousedown", "touchstart", "wheel"] as const) map.on(ev, () => cbs.current.onInteract());

    const draw = makeDraw();
    const m = map as unknown as { _controlContainer?: unknown };
    if (!m._controlContainer) m._controlContainer = (map as unknown as { getContainer(): HTMLElement }).getContainer();
    map.addControl(draw as unknown as maplibregl.IControl, "top-right");
    drawRef.current = draw;

    const keepOnly = (id: string | number | undefined) => {
      for (const f of draw.getAll().features) {
        if (f.id !== undefined && String(f.id) !== String(id)) draw.delete(String(f.id));
      }
    };
    const emit = () => {
      const feats = draw.getAll().features.filter((f) => f.geometry.type === "Polygon");
      const latest = feats[feats.length - 1] as Feature<Polygon> | undefined;
      cbs.current.onDraw(latest ?? null);
    };
    type DrawEvt = { features: Array<Feature<Polygon> & { id?: string | number }> };
    map.on("draw.create", ((e: DrawEvt) => { const created = e.features[0]; keepOnly(created?.id); cbs.current.onDraw(created ?? null); }) as unknown as () => void);
    map.on("draw.update", ((e: DrawEvt) => { cbs.current.onDraw(e.features[0] ?? null); }) as unknown as () => void);
    map.on("draw.delete", emit);

    map.on("load", () => {
      map.addSource("states", { type: "geojson", data: "/data/india-adm1.geojson" });
      map.addLayer({ id: "states-line", type: "line", source: "states", paint: { "line-color": "#6b7f95", "line-width": 0.6, "line-opacity": 0.4 } });

      // OpenStreetMap power infrastructure: lines by voltage class, substations as squares.
      map.addSource("power", { type: "geojson", data: "/data/osm-power-context.geojson" });
      map.addLayer({
        id: "power-line",
        type: "line",
        source: "power",
        filter: ["==", ["get", "kind"], "line"],
        paint: {
          "line-color": KV_COLOR,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 8, 1.1, 12, 2.2],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.35, 7, 0.7, 11, 0.85],
        },
      });
      map.addLayer({
        id: "power-substation",
        type: "circle",
        source: "power",
        filter: ["==", ["get", "kind"], "substation"],
        minzoom: 6,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2, 10, ["case", [">=", ["coalesce", ["get", "kV"], 0], 220], 6, 4], 13, ["case", [">=", ["coalesce", ["get", "kV"], 0], 220], 9, 6]],
          "circle-color": KV_COLOR,
          "circle-opacity": 0.9,
          "circle-stroke-color": "#0a0d12",
          "circle-stroke-width": 1,
        },
      });

      map.addSource("facilities", { type: "geojson", data: "/data/peeringdb-india-context.geojson" });
      map.addLayer({
        id: "facilities-dot",
        type: "circle",
        source: "facilities",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.2, 9, 5],
          "circle-color": "#9fb7ff",
          "circle-opacity": 0.8,
          "circle-stroke-color": "#0a0d12",
          "circle-stroke-width": 0.6,
        },
      });

      map.addSource("candidates", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "candidates-fill", type: "fill", source: "candidates",
        paint: {
          "fill-color": ["case", ["==", ["get", "selected"], true], "#8b9eff", "#c7d0dc"],
          "fill-opacity": ["case", ["==", ["get", "selected"], true], 0.22, 0.08],
        },
      });
      map.addLayer({
        id: "candidates-line", type: "line", source: "candidates",
        paint: {
          "line-color": ["case", ["==", ["get", "selected"], true], "#8b9eff", "#c7d0dc"],
          "line-width": ["case", ["==", ["get", "selected"], true], 2.4, 1.2],
        },
      });
      map.addLayer({
        id: "candidates-label", type: "symbol", source: "candidates",
        layout: {
          "text-field": ["get", "label"],
          "text-font": usingMapbox() ? ["DIN Pro Medium", "Arial Unicode MS Regular"] : ["Open Sans Regular"],
          "text-size": 12,
          "text-offset": [0, -1.6],
          "text-allow-overlap": false,
        },
        paint: { "text-color": "#f2f4f7", "text-halo-color": "#0a0d12", "text-halo-width": 1.4 },
      });

      const pick = (e: maplibregl.MapMouseEvent) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ["candidates-fill"] })[0];
        if (hit?.properties?.id) cbs.current.onSelectSite(String(hit.properties.id));
      };
      map.on("click", "candidates-fill", pick);
      map.on("mouseenter", "candidates-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "candidates-fill", () => (map.getCanvas().style.cursor = ""));

      // Hover previews only — they never call the model.
      const pop = new maplibregl.Popup({ closeButton: false, className: "atlas-pop" });
      const hover = (layer: string, html: (p: Record<string, unknown>) => string) => {
        map.on("mouseenter", layer, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          map.getCanvas().style.cursor = "help";
          const c = f.geometry.type === "Point" ? (f.geometry.coordinates.slice(0, 2) as [number, number]) : (e.lngLat.toArray() as [number, number]);
          pop.setLngLat(c).setHTML(html(f.properties ?? {})).addTo(map);
        });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; pop.remove(); });
      };
      const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch] as string);
      hover("facilities-dot", (p) => `<div style="font:500 11px Geist,sans-serif;color:#0a0d12">${esc(p.name)}<br><span style="color:#4f6b7a">${esc(p.city)} · PeeringDB · context only</span></div>`);
      hover("power-substation", (p) => `<div style="font:500 11px Geist,sans-serif;color:#0a0d12">${esc(p.name ?? "Substation (unnamed)")}${p.kV ? ` · ${esc(p.kV)} kV` : ""}<br><span style="color:#4f6b7a">OpenStreetMap · presence, not capacity</span></div>`);
      hover("power-line", (p) => `<div style="font:500 11px Geist,sans-serif;color:#0a0d12">Power line${p.kV ? ` · ${esc(p.kV)} kV` : " · voltage untagged"}<br><span style="color:#4f6b7a">OpenStreetMap · presence, not capacity</span></div>`);

      cbs.current.onControls({
        start: () => draw.changeMode("draw_polygon"),
        clear: () => { draw.deleteAll(); cbs.current.onDraw(null); },
        load: (polygon: Polygon) => {
          draw.deleteAll();
          draw.add({ type: "Feature", properties: {}, geometry: polygon } as Feature<Polygon>);
          emit();
        },
        isDrawing: () => draw.getMode() === "draw_polygon",
        cancel: () => {
          if (draw.getMode() !== "draw_polygon") return false;
          draw.changeMode("simple_select");
          return true;
        },
      });
      cbs.current.onReady(map);
      setReady(true);
    });

    })();

    return () => {
      disposed = true;
      ac.abort();
      setReady(false);
      markerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Candidate geometry and selection
  useEffect(() => {
    if (!ready) return;
    const src = mapRef.current?.getSource("candidates") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: candidates.map((c) => ({ type: "Feature" as const, geometry: c.geometry, properties: { id: c.id, label: c.name, selected: c.id === selectedId } })),
    });
  }, [candidates, selectedId, ready]);

  // Layer toggles
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    const set = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none"); };
    set("states-line", layers.states);
    set("facilities-dot", layers.facilities);
    for (const id of ["power-line", "power-substation"]) set(id, layers.power);
    for (const id of ["candidates-fill", "candidates-line", "candidates-label"]) set(id, layers.candidates);
  }, [layers, ready]);

  // Agent- or dossier-driven focus: fly, drop a pulsing labelled marker, fade it after a while.
  useEffect(() => {
    if (!ready || !focus) return;
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    const node = document.createElement("div");
    node.className = "focus-marker";
    const label = document.createElement("div");
    label.className = "focus-label";
    label.textContent = focus.label;
    node.appendChild(label);
    const marker = new maplibregl.Marker({ element: node, anchor: "center" }).setLngLat(focus.center).addTo(map);
    markerRef.current = marker;
    map.flyTo({ center: focus.center, zoom: focus.zoom, duration: 1400, essential: true });
    const t = setTimeout(() => { marker.remove(); if (markerRef.current === marker) markerRef.current = null; }, 9000);
    return () => clearTimeout(t);
  }, [focus, ready]);

  return (
    <div className="absolute inset-0" role="application" aria-label="Map of India with candidate sites">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
