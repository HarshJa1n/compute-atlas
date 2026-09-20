import { test } from "node:test";
import assert from "node:assert/strict";
import { quantities, capacityCriterion, evaluate, PRESETS } from "../lib/analysis/evaluate.ts";

const site = (o = {}) => ({
  id: "T", name: "test", kind: "synthetic",
  areaHectares: 10, availableMW: 40, waterCapLDay: 300000, ...o,
});

test("quantities match the reference arithmetic", () => {
  const q = quantities(PRESETS.campus);
  assert.equal(q.fullLoadFacilityMW, 26);            // 20 * 1.3
  assert.equal(q.averageFacilityMW, 20 * 0.8 * 1.3);
  assert.equal(q.waterLDay, 20 * 0.8 * 24000 * 0.5);
  assert.equal(q.annualMWh, q.averageFacilityMW * 8760);
});

test("out-of-range assumptions are rejected, not coerced", () => {
  assert.throws(() => quantities({ ...PRESETS.campus, pue: 0.5 }));
  assert.throws(() => quantities({ ...PRESETS.campus, utilization: 1.4 }));
  assert.throws(() => quantities({ ...PRESETS.campus, itMW: 0 }));
});

test("absent capacity is unknown and never a pass", () => {
  assert.equal(capacityCriterion(10, null), "unknown");
  assert.equal(capacityCriterion(10, undefined), "unknown");
  assert.equal(capacityCriterion(10, 10), "pass");
  assert.equal(capacityCriterion(10, 9.99), "fail");
});

test("a conflict outranks any available figure", () => {
  assert.equal(capacityCriterion(10, 999, { conflict: true }), "conflict");
});

test("unknown power drives needs-investigation, not a pass", () => {
  const a = evaluate(PRESETS.campus, site({ availableMW: null }));
  assert.equal(a.criteria.find((c) => c.id === "power").state, "unknown");
  assert.equal(a.status, "needs-investigation");
});

test("a supplied requirement failure dominates unknowns", () => {
  const a = evaluate(PRESETS.campus, site({ availableMW: 5, waterCapLDay: null }));
  assert.equal(a.status, "fails-supplied-requirement");
});

test("schedule fails when energisation lands after opening", () => {
  const a = evaluate(PRESETS.campus, site({ availableFromDate: "2027-12-01" }));
  assert.equal(a.criteria.find((c) => c.id === "schedule").state, "fail");
});

test("modular preset needs materially less power and water", () => {
  const c = quantities(PRESETS.campus);
  const m = quantities(PRESETS.modular);
  assert.ok(m.fullLoadFacilityMW < c.fullLoadFacilityMW);
  assert.ok(m.waterLDay < c.waterLDay);
});

test("the full-load figure ignores utilisation by design", () => {
  const a = quantities({ ...PRESETS.campus, utilization: 0.2 });
  const b = quantities({ ...PRESETS.campus, utilization: 0.9 });
  assert.equal(a.fullLoadFacilityMW, b.fullLoadFacilityMW);
});
