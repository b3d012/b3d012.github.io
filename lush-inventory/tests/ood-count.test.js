import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import XLSX from "xlsx";
import { importInventory, exportOODCount } from "../src/xlsx-adapter.js";
import { createOODCount, updateOODRow, oodTotals, archiveOODCount, oodProductionRanges } from "../src/ood-count.js";
import { emptyVault, validateVault } from "../src/coordinator-store.js";

globalThis.XLSX = XLSX;
const source = await readFile(new URL("./fixtures/PreChanges.xlsx", import.meta.url));
const makeCount = () => createOODCount(importInventory(source, "Weekly.xlsx"), "2026-10-31", 7);

test("production ranges match the approved example and honor different shelf lives", () => {
  assert.deepEqual(oodProductionRanges("2026-11-14", 7), [
    [null, "2026-04-14"], ["2026-04-15", "2026-05-14"], ["2026-05-15", "2026-06-14"],
    ["2026-06-15", "2026-07-14"], ["2026-07-15", null],
  ]);
  assert.deepEqual(oodProductionRanges("2026-11-14", 8)[0], [null, "2026-03-14"]);
});

test("month-end cutoffs include production days that share a clamped expiry", () => {
  assert.deepEqual(oodProductionRanges("2027-02-28", 7), [
    [null, "2026-07-31"], ["2026-08-01", "2026-08-28"], ["2026-08-29", "2026-09-28"],
    ["2026-09-29", "2026-10-28"], ["2026-10-29", null],
  ]);
  assert.deepEqual(oodProductionRanges("2028-02-29", 7)[0], [null, "2027-07-31"]);
});

test("physical quantities in all five buckets expose shortages, including decimals and confirmed zero", () => {
  let count = makeCount();
  assert.equal(count.products.length, 119);
  const id = count.products[0].id;
  assert.equal(oodTotals(count.products[0]).complete, false);
  count = updateOODRow(count, id, "pastDue", "1");
  assert.equal(oodTotals(count.products[0]).complete, false, "the physically counted remainder must be entered");
  count = updateOODRow(count, id, "month1", "0.5");
  count = updateOODRow(count, id, "later", "4");
  assert.deepEqual(oodTotals(count.products[0]), { complete: true, total: 5.5, variance: -2.5, state: "under" });
  assert.equal(oodTotals(updateOODRow(count, id, "later", "-1").products[0]).state, "invalid");
  assert.equal(oodTotals(updateOODRow(count, id, "later", "").products[0]).complete, false);
  assert.equal(oodTotals(updateOODRow(makeCount(), id, "later", "0").products[0]).variance, -8);
});

test("OOD export prints independent window quantities and on-hand-minus-counted variance", () => {
  let count = makeCount();
  count = updateOODRow(count, count.products[0].id, "pastDue", "1");
  count = updateOODRow(count, count.products[0].id, "later", "6");
  count = updateOODRow(count, count.products[1].id, "later", "4");
  count = updateOODRow(count, count.products[3].id, "pastDue", "2");
  const book = XLSX.read(exportOODCount(count), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(book.Sheets["OOD Count"], { header: 1, defval: "" });
  assert.deepEqual(rows[0].slice(5), ["Already OOD", "1 Month to OOD", "2 Months to OOD", "3 Months to OOD", "More than 3 Months to OOD", "Counted", "Variance"]);
  assert.deepEqual(rows[1].slice(4), [8, 1, 0, 0, 0, 6, 7, 1]);
  assert.equal(rows[2][11], -1);
  assert.deepEqual(rows[3].slice(5), ["", "", "", "", "", "", ""]);
  assert.deepEqual(rows[4].slice(5), [2, "", "", "", "", "", ""]);
});

test("OOD archives are independent, immutable and validated alongside older private records", () => {
  const original = emptyVault();
  const count = makeCount();
  const draft = updateOODRow(count, count.products[0].id, "later", "8");
  const current = { ...original, oodDraft: draft };
  const saved = archiveOODCount(current, "2026-10-31T12:00:00Z");
  assert.equal(saved.oodDraft, null);
  assert.deepEqual(saved.archives, original.archives);
  assert.deepEqual(saved.expiryRecords, original.expiryRecords);
  assert.equal(saved.oodCounts[0].products[0].buckets.later, "8");
  draft.products[0].buckets.later = "7";
  assert.equal(saved.oodCounts[0].products[0].buckets.later, "8");
  assert.doesNotThrow(() => validateVault(saved));
  const malformed = structuredClone(saved);
  malformed.oodCounts[0].products[0].buckets.later = 8;
  assert.throws(() => validateVault(malformed), /OOD/);
  assert.doesNotThrow(() => validateVault(original));
});
