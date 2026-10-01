import test from "node:test";
import assert from "node:assert/strict";
import * as history from "../src/history-model.js";
const vault = () => ({ schemaVersion: 1, archives: [], expiryRecords: [], departmentChecks: [], events: [] });
const count = (id = "a", extras = {}) => ({ id, schemaVersion: 2, fileName: "week.xlsx", postingDate: "2026-10-01", products: [{ id: "p", plu: "01", department: "HAIR", unit: "PCS", category: "A", description: "Item", cost: 18, onHand: 9, display: "7", cupboard: "0", storeRoom: "0", confirmed: true, provenance: "physical-recount", ...extras }] });
test("archive deduplicates and declared corrections never overwrite physical evidence", () => {
  const original = count();
  let records = history.archiveCount(vault(), original, "2026-10-01T10:00:00Z");
  records = history.archiveCount(records, original, "2026-10-01T10:01:00Z");
  assert.equal(records.archives.length, 1);
  records = history.reviseOutcome(records, "a", "p", { declaredQuantity: 9, reason: "tester-pending", note: "Confirm with manager", resolved: false }, "2026-10-01T11:00:00Z");
  assert.equal(records.archives[0].count.products[0].display, "7");
  assert.equal(records.archives[0].outcomes.p.declaredQuantity, 9);
  assert.equal(records.archives[0].outcomes.p.resolved, false);
  assert.equal(records.archives[0].revisions.length, 1);
  assert.equal(original.products[0].display, "7");
});
test("cost summaries separate shortage and surplus and report missing cost coverage", () => {
  let records = history.archiveCount(vault(), count());
  records = history.archiveCount(records, count("b", { display: "10", cost: 5 }));
  records = history.archiveCount(records, count("c", { plu: "02", cost: null }));
  const summary = history.historySummary(records);
  assert.equal(summary.shortageValue, 36);
  assert.equal(summary.surplusValue, 5);
  assert.equal(summary.unknownCost, 1);
});
test("repeated unresolved shortage is an observation series, not summed new losses", () => {
  let records = history.archiveCount(vault(), count("a"));
  records = history.archiveCount(records, { ...count("b"), postingDate: "2026-10-08" });
  const repeated = history.historySummary(records).repeatShortages;
  assert.equal(repeated[0].observations, 2);
  assert.equal(repeated[0].latestVariance, -2);
  assert.ok(!Object.hasOwn(repeated[0], "newLossValue"));
});
test("partial snapshots exclude absent products and incompatible units from movement", () => {
  const previous = count("a");
  const current = { ...count("b", { onHand: 4 }), postingDate: "2026-10-08" };
  assert.equal(history.compareSnapshots(previous, current)[0].change, -5);
  assert.equal(history.compareSnapshots(previous, { ...current, products: [] }).length, 0);
  assert.equal(history.compareSnapshots(previous, { ...current, products: [{ ...current.products[0], unit: "KG" }] })[0].change, null);
});
test("MAX rows do not produce physical shortage observations", () => {
  const records = history.archiveCount(vault(), count("m", { provenance: "carried-forward", display: "9" }));
  assert.equal(history.historySummary(records).physicalObservations, 0);
  assert.equal(history.historySummary(records).accepted, 1);
});
test("importing an older file later cannot move the department's latest snapshot backwards", () => {
  let records = history.archiveCount(vault(), { ...count("newer"), postingDate: "2026-10-08" }, "2026-10-08T10:00:00Z");
  records = history.archiveCount(records, { ...count("older"), postingDate: "2026-10-01" }, "2026-10-09T10:00:00Z");
  assert.equal(history.historySummary(records).departments[0].lastSnapshot, "2026-10-08");
});
test("conflicting duplicate rows in one snapshot are not repeated shortage observations", () => {
  const duplicate = count(); duplicate.products.push({ ...duplicate.products[0], id: "p2", display: "6" });
  assert.equal(history.historySummary(history.archiveCount(vault(), duplicate)).repeatShortages.length, 0);
});
test("department coverage separates imports, snapshots and genuinely completed counts", () => {
  let records = history.archiveCount(vault(), { ...count("done"), importedAt: "2026-10-01T09:00:00Z" }, "2026-10-01T10:00:00Z");
  records = history.archiveCount(records, { ...count("partial", { confirmed: false, provenance: "untouched" }), importedAt: "2026-10-08T09:00:00Z", postingDate: "2026-10-08" }, "2026-10-08T10:00:00Z");
  const active = { ...count("active", { confirmed: false, provenance: "untouched" }), postingDate: "2026-10-09", importedAt: "2026-10-09T09:00:00Z" };
  const coverage = history.historySummary(records, active).departments[0];
  assert.equal(coverage.lastSnapshot, "2026-10-09");
  assert.equal(coverage.lastImport, "2026-10-09T09:00:00Z");
  assert.equal(coverage.lastCount, "2026-10-01T10:00:00Z");
});
test("dated compatible source changes flag differing snapshot costs", () => {
  const previous = count("a"), current = { ...count("b", { cost: 20 }), postingDate: "2026-10-08" };
  assert.match(history.compareSnapshots(previous, current)[0].warning, /cost/i);
});
