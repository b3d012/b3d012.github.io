import test from "node:test";
import assert from "node:assert/strict";
import { countAreas, countTitle, namedWorkbook, startRegularCount } from "../src/count-naming.js";
import { archiveCount } from "../src/history-model.js";
import { archiveOODCount, createOODCount, updateOODRow } from "../src/ood-count.js";
import { emptyVault } from "../src/coordinator-store.js";
import { exportFileName } from "../src/xlsx-adapter.js";

const source = {
  schemaVersion: 2, id: "count", fileName: "Store Inventory Journal (12).xlsx",
  importedAt: "2026-11-13T20:45:00Z", postingDate: "2026-11-12", warnings: [],
  products: ["SKINCARE", "MOUTH", "MAKEUP", "skincare"].map((department, i) => ({
    id: String(i), plu: String(i), description: "Product", category: "CARDS", department,
    onHand: 2, display: "0", cupboard: "0", storeRoom: "0", confirmed: false, provenance: "untouched",
  })),
};

test("regular count mode and Dubai count date appear in history and in the Excel filename", () => {
  const count = startRegularCount(source, "pre-inventory", "", new Date("2026-11-13T20:45:00Z"));
  const saved = archiveCount(emptyVault(), count, "2026-11-16T03:00:00Z").archives[0].count;
  assert.equal(countTitle(saved), "Pre_Inventory - Area Skincare, Mouth and Makeup - 14.11.2026");
  assert.equal(exportFileName(saved), "Pre_Inventory - Area Skincare, Mouth and Makeup - 14.11.2026.xlsx");
  assert.equal(saved.fileName, source.fileName);
  assert.equal(saved.postingDate, "2026-11-12");
  assert.equal(countTitle(startRegularCount(source, "cycle", "Front / Gifts", new Date("2026-11-16T05:00:00Z"))), "Cycle Count - Area Front / Gifts - 16.11.2026");
  assert.equal(namedWorkbook(startRegularCount(source, "cycle", "Front / Gifts", new Date("2026-11-16T05:00:00Z"))), "Cycle Count - Area Front - Gifts - 16.11.2026.xlsx");
  assert.equal(countTitle(source), source.fileName);
});

test("OOD uses the physical check date, and area suggestions fall back to category", () => {
  const withoutDepartment = { ...source, products: [{ ...source.products[0], department: null }] };
  assert.equal(countAreas(withoutDepartment), "Cards");
  let draft = createOODCount(withoutDepartment, "2026-11-14", 7);
  draft = updateOODRow(draft, "0", "later", "2");
  const saved = archiveOODCount({ ...emptyVault(), oodDraft: draft }, "2026-11-16T05:00:00Z").oodCounts[0];
  assert.equal(countTitle(saved), "OOD Count - Area Cards - 14.11.2026");
  assert.equal(namedWorkbook(saved), "OOD Count - Area Cards - 14.11.2026.xlsx");
  assert.equal(saved.fileName, source.fileName);
});
