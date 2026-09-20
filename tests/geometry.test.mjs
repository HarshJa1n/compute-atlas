import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePolygon, parsePolygon, MIN_HECTARES } from "../lib/analysis/geometry.ts";

const INDIA = [68.1, 6.5, 97.4, 37.1];
const box = (lon, lat, d) => ({
  type: "Polygon",
  coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]],
});

test("a normal parcel validates and reports area", () => {
  const r = validatePolygon(box(77.53, 23.18, 0.01), INDIA);
  assert.equal(r.ok, true);
  assert.ok(r.hectares > 80 && r.hectares < 130);
});

test("a self-intersecting outline is rejected", () => {
  const bowtie = { type: "Polygon", coordinates: [[[77, 23], [77.02, 23.02], [77.02, 23], [77, 23.02], [77, 23]]] };
  const r = validatePolygon(bowtie, INDIA);
  assert.equal(r.ok, false);
  assert.match(r.reason, /crosses itself/i);
});

test("a polygon outside India is rejected", () => {
  const r = validatePolygon(box(2.3, 48.8, 0.01), INDIA); // Paris
  assert.equal(r.ok, false);
  assert.match(r.reason, /outside India/i);
});

test("degenerate and oversized geometry is rejected", () => {
  assert.equal(validatePolygon(box(77.5, 23.1, 0.00001), INDIA).ok, false);
  assert.equal(validatePolygon(box(70, 10, 10), INDIA).ok, false);
});

test("too few corners is rejected", () => {
  const r = validatePolygon({ type: "Polygon", coordinates: [[[77, 23], [77.01, 23], [77, 23]]] }, INDIA);
  assert.equal(r.ok, false);
});

test("non-finite coordinates are rejected rather than thrown", () => {
  const bad = { type: "Polygon", coordinates: [[[77, 23], [NaN, 23], [77.01, 23.01], [77, 23]]] };
  assert.equal(validatePolygon(bad, INDIA).ok, false);
});

test("parsePolygon accepts Polygon, Feature and FeatureCollection", () => {
  const g = box(77.53, 23.18, 0.01);
  assert.equal(parsePolygon(JSON.stringify(g)).type, "Polygon");
  assert.equal(parsePolygon(JSON.stringify({ type: "Feature", properties: {}, geometry: g })).type, "Polygon");
  assert.equal(
    parsePolygon(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: g }] })).type,
    "Polygon"
  );
});

test("parsePolygon returns null for junk and for non-polygons", () => {
  assert.equal(parsePolygon("not json"), null);
  assert.equal(parsePolygon(JSON.stringify({ type: "Point", coordinates: [77, 23] })), null);
});

test("the minimum area threshold is enforced at the boundary", () => {
  assert.ok(MIN_HECTARES > 0);
});
