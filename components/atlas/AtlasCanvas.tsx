"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Feature, Polygon } from "geojson";
import { resolveStyle, transformRequest, usingMapbox } from "@/lib/map/mapbox";

export type Layers = { states: boolean; facilities: boolean; candidates: boolean };

/** Our own UI drives drawing; the plugin's control strip is not the only entry point. */
export type DrawControls = {
  start: () => void;
  clear: () => void;
  load: (polygon: Polygon) => void;
  isDrawing: () => boolean;
  cancel: () => boolean;
};

type Props = {
  onReady: (map: MLMap) => void;
  onControls: (controls: DrawControls) => void;
  onDraw: (feature: Feature<Polygon> | null) => void;
  onSelectSite: (id: string) => void;
  candidates: Array<{ id: string; name: string; geometry: Polygon }>;
  selectedId: string | null;
  layers: Layers;
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
    // Drawn geometry is styled to the atlas palette rather than Mapbox defaults.
    styles: [
      { id: "gl-draw-polygon-fill", type: "fill", filter: ["all", ["==", "$type", "Polygon"]], paint: { "fill-color": "#43dfc3", "fill-opacity": 0.12 } },
      { id: "gl-draw-polygon-stroke", type: "line", filter: ["all", ["==", "$type", "Polygon"]], paint: { "line-color": "#43dfc3", "line-width": 2 } },
      { id: "gl-draw-vertex", type: "circle", filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]], paint: { "circle-radius": 5, "circle-color": "#09131c", "circle-stroke-color": "#43dfc3", "circle-stroke-width": 2 } },
      { id: "gl-draw-midpoint", type: "circle", filter: ["all", ["==", "meta", "midpoint"]], paint: { "circle-radius": 3, "circle-color": "#7ebbff" } },
      { id: "gl-draw-line", type: "line", filter: ["all", ["==", "$type", "LineString"]], paint: { "line-color": "#43dfc3", "line-width": 2, "line-dasharray": [0.2, 2] } },
    ],
  });
}

export default function AtlasCanvas({ onReady, onControls, onDraw, onSelectSite, candidates, selectedId, layers }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [ready, setReady] = useState(false);
  const cbs = useRef({ onDraw, onSelectSite, onReady, onControls });
  cbs.current = { onDraw, onSelectSite, onReady, onControls };

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    let disposed = false;
    const ac = new AbortController();

    // The style must be fetched and sanitised before construction, so setup is async.
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
        customAttribution: usingMapbox() ? "© Mapbox © OpenStreetMap" : "© CARTO © OpenStreetMap",
      }),
      "bottom-right"
    );
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    const draw = makeDraw();
    // mapbox-gl-draw calls this during onAdd; MapLibre v4 no longer exposes it.
    const m = map as unknown as { _controlContainer?: unknown };
    if (!m._controlContainer) m._controlContainer = (map as unknown as { getContainer(): HTMLElement }).getContainer();
    map.addControl(draw as unknown as maplibregl.IControl, "top-right");
    drawRef.current = draw;

    // One site polygon at a time: a new shape replaces the previous one, so a
    // rejected outline can never linger and be re-read ahead of the new one.
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
    map.on("draw.create", ((e: DrawEvt) => {
      const created = e.features[0];
      keepOnly(created?.id);
      cbs.current.onDraw(created ?? null);
    }) as unknown as () => void);
    map.on("draw.update", ((e: DrawEvt) => {
      cbs.current.onDraw(e.features[0] ?? null);
    }) as unknown as () => void);
    map.on("draw.delete", emit);

    map.on("load", () => {
      map.addSource("states", { type: "geojson", data: "/data/india-adm1.geojson" });
      map.addLayer({
        id: "states-line",
        type: "line",
        source: "states",
        paint: { "line-color": "#7ebbff", "line-width": 0.6, "line-opacity": 0.35 },
      });

      map.addSource("facilities", { type: "geojson", data: "/data/peeringdb-india-context.geojson" });
      map.addLayer({
        id: "facilities-dot",
        type: "circle",
        source: "facilities",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.2, 9, 5],
          "circle-color": "#7ebbff",
          "circle-opacity": 0.75,
          "circle-stroke-color": "#09131c",
          "circle-stroke-width": 0.6,
        },
      });

      map.addSource("candidates", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "candidates-fill",
        type: "fill",
        source: "candidates",
        paint: {
          "fill-color": ["case", ["==", ["get", "selected"], true], "#43dfc3", "#a8bac7"],
          "fill-opacity": ["case", ["==", ["get", "selected"], true], 0.22, 0.08],
        },
      });
      map.addLayer({
        id: "candidates-line",
        type: "line",
        source: "candidates",
        paint: {
          "line-color": ["case", ["==", ["get", "selected"], true], "#43dfc3", "#a8bac7"],
          "line-width": ["case", ["==", ["get", "selected"], true], 2.4, 1.2],
        },
      });
      map.addLayer({
        id: "candidates-label",
        type: "symbol",
        source: "candidates",
        layout: {
          "text-field": ["get", "label"],
          "text-font": usingMapbox() ? ["DIN Pro Medium", "Arial Unicode MS Regular"] : ["Open Sans Regular"],
          "text-size": 11,
          "text-offset": [0, -1.6],
          "text-allow-overlap": false,
        },
        paint: { "text-color": "#f0f5f7", "text-halo-color": "#09131c", "text-halo-width": 1.4 },
      });

      const pick = (e: maplibregl.MapMouseEvent) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ["candidates-fill"] })[0];
        if (hit?.properties?.id) cbs.current.onSelectSite(String(hit.properties.id));
      };
      map.on("click", "candidates-fill", pick);
      map.on("mouseenter", "candidates-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "candidates-fill", () => (map.getCanvas().style.cursor = ""));

      // Facility identification is a hover preview only — it never calls the model.
      const pop = new maplibregl.Popup({ closeButton: false, className: "atlas-pop" });
      map.on("mouseenter", "facilities-dot", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "help";
        pop
          .setLngLat((f.geometry as unknown as { coordinates: [number, number] }).coordinates)
          .setHTML(
            `<div style="font:500 11px Inter,sans-serif;color:#09131c">${String(f.properties?.name ?? "")}<br><span style="color:#41606f">${String(f.properties?.city ?? "")} · PeeringDB</span></div>`
          )
          .addTo(map);
      });
      map.on("mouseleave", "facilities-dot", () => {
        map.getCanvas().style.cursor = "";
        pop.remove();
      });

      cbs.current.onControls({
        start: () => draw.changeMode("draw_polygon"),
        clear: () => {
          draw.deleteAll();
          cbs.current.onDraw(null);
        },
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
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Candidate geometry and selection
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const src = map?.getSource("candidates") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: candidates.map((c) => ({
        type: "Feature" as const,
        geometry: c.geometry,
        properties: { id: c.id, label: c.name, selected: c.id === selectedId },
      })),
    });
  }, [candidates, selectedId, ready]);

  // Layer toggles
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    const set = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    set("states-line", layers.states);
    set("facilities-dot", layers.facilities);
    for (const id of ["candidates-fill", "candidates-line", "candidates-label"]) set(id, layers.candidates);
  }, [layers, ready]);

  // The library stylesheet forces `position: relative` on its own container,
  // so the positioning lives on a wrapper it does not touch.
  return (
    <div className="absolute inset-0" role="application" aria-label="Map of India with candidate sites">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
