import { test } from "node:test";
import assert from "node:assert/strict";
import { diff, appendRun, describeChange } from "../lib/analysis/scenario.ts";
import { evaluate, PRESETS } from "../lib/analysis/evaluate.ts";

const site = (o = {}) => ({ id: "T", name: "t", kind: "synthetic", areaHectares: 10, availableMW: 40, waterCapLDay: 300000, ...o });

test("diff reports criteria whose verdict moved", () => {
  const before = evaluate(PRESETS.campus, site({ availableMW: null }));
  const after = evaluate(PRESETS.campus, site({ availableMW: 40 }));
  const d = diff(before, after);
  const power = d.find((x) => x.criterionId === "power");
  assert.equal(power.from, "unknown");
  assert.equal(power.to, "pass");
});

test("diff is empty when nothing changed", () => {
  const a = evaluate(PRESETS.campus, site());
  assert.equal(diff(a, evaluate(PRESETS.campus, site())).length, 0);
});

test("appendRun preserves earlier versions and numbers them", () => {
  const a = evaluate(PRESETS.campus, site());
  let h = appendRun([], { at: "", siteId: "T", label: "first", brief: PRESETS.campus, assessment: a });
  h = appendRun(h, { at: "", siteId: "T", label: "second", brief: PRESETS.modular, assessment: a });
  assert.deepEqual(h.map((r) => r.version), [1, 2]);
  assert.equal(h[0].label, "first", "history must not be mutated");
});

test("history is bounded but keeps the most recent runs", () => {
  const a = evaluate(PRESETS.campus, site());
  let h = [];
  for (let i = 0; i < 20; i++) h = appendRun(h, { at: "", siteId: "T", label: `r${i}`, brief: PRESETS.campus, assessment: a }, 5);
  assert.equal(h.length, 5);
  assert.equal(h[h.length - 1].version, 20);
});

test("describeChange names the assumption that moved", () => {
  assert.match(describeChange(PRESETS.campus, { ...PRESETS.campus, itMW: 5 }), /IT load 20 MW → 5 MW/);
  assert.equal(describeChange(PRESETS.campus, PRESETS.campus), "evidence updated");
});
