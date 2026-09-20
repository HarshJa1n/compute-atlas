import { test } from "node:test";
import assert from "node:assert/strict";
import { extractClaims, reconcile, paragraphs } from "../lib/analysis/extract.ts";

const doc = (id, title, text) => ({ id, title, siteId: "A", text, origin: "fixture", ingestedAt: "" });

const BROKER = doc("demo-broker-A", "Broker brief", `SYNTHETIC
Paragraph 1. Fictional parcel A is being considered for a 20 MW IT campus.
Paragraph 2. The fictional broker claims 30 MW could be available by June 2027.
Paragraph 3. This claim is indicative and does not constitute a utility supply commitment.`);

const UTILITY = doc("demo-utility-A", "Utility note", `SYNTHETIC
Paragraph 1. For fictional parcel A, the scenario assumes preliminary support for 12 MW, conditional on connection studies.
Paragraph 2. The scenario's earliest connection date is December 2027, with no binding commitment.
Paragraph 3. A larger request requires a further study.`);

test("numbered paragraphs keep their citation numbers", () => {
  const ps = paragraphs(BROKER.text);
  assert.equal(ps.length, 3);
  assert.equal(ps[1].n, 2);
  assert.match(ps[1].text, /30 MW/);
});

test("capacity figures are extracted with units", () => {
  const claims = extractClaims(BROKER);
  const power = claims.filter((c) => c.kind === "power-capacity");
  assert.deepEqual(power.map((c) => c.value), [20, 30]);
  assert.equal(power[0].unit, "MW");
});

test("documents that disclaim their own figures are marked qualified", () => {
  const claims = extractClaims(BROKER);
  assert.equal(claims[2].qualified, true);
  assert.equal(claims[0].qualified, false);
});

test("a connection date is parsed to ISO", () => {
  const claims = extractClaims(UTILITY);
  const d = claims.find((c) => c.kind === "connection-date");
  assert.equal(d.unit, "2027-12-01");
});

test("two documents stating different capacities produce a conflict", () => {
  const claims = [...extractClaims(BROKER), ...extractClaims(UTILITY)];
  const r = reconcile(claims);
  assert.notEqual(r.powerConflict, false);
  assert.match(r.powerConflict.claim, /30/);
  assert.match(r.powerConflict.counterClaim, /12/);
  assert.equal(r.availableMW, null, "a contradiction must not resolve to a number");
});

test("a single document resolves to its most cautious figure", () => {
  const r = reconcile(extractClaims(UTILITY));
  assert.equal(r.powerConflict, false);
  assert.equal(r.availableMW, 12);
});

test("no documents means no inputs, not zero", () => {
  const r = reconcile([]);
  assert.equal(r.availableMW, null);
  assert.equal(r.waterCapLDay, null);
  assert.equal(r.powerConflict, false);
});

test("water capacity is extracted with commas", () => {
  const r = reconcile(extractClaims(doc("d", "Municipal note", "Paragraph 1. The allocation is 150,000 L/day.")));
  assert.equal(r.waterCapLDay, 150000);
});

test("the latest stated connection date is the binding one", () => {
  const claims = [
    ...extractClaims(doc("d1", "A", "Paragraph 1. Connection available by June 2027.")),
    ...extractClaims(doc("d2", "B", "Paragraph 1. Connection available by December 2027.")),
  ];
  assert.equal(reconcile(claims).availableFromDate, "2027-12-01");
});
