import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as XLSX from "xlsx";
import StyleXLSX from "xlsx-js-style";
import {
  normalizeHeader,
  importInventory,
  exportInventory,
  exportCoordinatorReport,
} from "../src/xlsx-adapter.js";

globalThis.XLSX = XLSX;

test("coordinator report separates original count, accepted total and declared outcome", () => {
  const count = { products: [{ id: "p", category: "A", plu: "01", description: "Item", unit: "PCS", onHand: 5, cost: 2, display: "3", cupboard: "0", storeRoom: "0", confirmed: true, provenance: "physical-recount" }], postingDate: "2026-10-01", fileName: "week.xlsx" };
  const vault = { archives: [{ id: "a", archivedAt: "2026-10-01T10:00:00Z", count, outcomes: { p: { declaredQuantity: 5, reason: "tester-pending", note: "Private note", resolved: false } }, revisions: [] }], expiryRecords: [], departmentChecks: [] };
  const wb = XLSX.read(exportCoordinatorReport(vault), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Count outcomes"], { header: 1 });
  assert.equal(rows[1][rows[0].indexOf("Physical quantity")], 3);
  assert.equal(rows[1][rows[0].indexOf("Declared quantity")], 5);
  assert.equal(rows[1][rows[0].indexOf("Discrepancy cost (AED)")], -4);
  assert.ok(wb.Sheets["OOD batches"]);
  assert.ok(wb.Sheets["Department checks"]);
});

test("optional metadata stays unknown and duplicate PLUs are warned", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Category", "Item No.(PLU)", "Description", "On Hand Qty."], ["A", "1", "Item", 2], ["B", "1", "Other", 3]]), "Items");
  const count = importInventory(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  assert.equal(count.products[0].cost, null);
  assert.equal(count.products[0].unit, null);
  assert.equal(count.postingDate, null);
  assert.ok(count.warnings.some((text) => /duplicate.*1/i.test(text)));
});

const fixture = new URL("./fixtures/PreChanges.xlsx", import.meta.url);

test("normalizes required header punctuation, spaces, and capitalization", () => {
  assert.equal(normalizeHeader(" Item No. (PLU) "), "itemnoplu");
  assert.equal(normalizeHeader("ON  HAND Qty."), "onhandqty");
});

test("imports the real 21-column export into 119 products", async () => {
  const data = await fs.readFile(fixture);
  const count = importInventory(data, "PreChanges.xlsx");
  assert.equal(count.products.length, 119);
  assert.equal(count.products[0].category, "CONDITIONER");
  assert.equal(count.products[0].plu, "60438");
  assert.equal(count.products[0].onHand, 8);
  assert.equal(count.schemaVersion, 2);
  assert.equal(count.products[0].department, "HAIRCARE");
  assert.equal(count.products[0].unit, "PCS");
  assert.equal(count.products[0].cost, 4.27911);
  assert.equal(count.postingDate, "2026-09-22");
  assert.equal(count.products[0].display, "0");
  assert.equal(count.products[0].confirmed, false);
  assert.equal(count.sourceSummary.totalCost, 2834.48408);
  assert.equal(count.products[19].plu, "2001063000000");
  assert.equal(count.products[19].onHand, 1.45);
  assert.equal(count.products.find((p) => p.plu === "64971").onHand, -2);
});

test("rejects missing or duplicate required headers without guessing", () => {
  const make = (headers) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ["A", "001", "Item", 2]]), "Store Inventory Journal");
    return XLSX.write(wb, { type: "array", bookType: "xlsx" });
  };
  assert.throws(() => importInventory(make(["Category", "Item No.(PLU)", "Description"]), "missing.xlsx"), /On Hand Qty/i);
  assert.throws(() => importInventory(make(["Category", "Item No.(PLU)", "Description", "On Hand Qty.", "On Hand Qty"]), "duplicate.xlsx"), /duplicate/i);
});

test("preserves identifier text including leading zeroes", () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Category", "Item No.(PLU)", "Description", "On Hand Qty."],
    ["TEST", "000123", "Leading zero", 1],
    ["TEST", "90071992547409931234", "Long PLU", 2],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Store Inventory Journal");
  const count = importInventory(XLSX.write(wb, { type: "array", bookType: "xlsx" }), "ids.xlsx");
  assert.deepEqual(count.products.map((p) => p.plu), ["000123", "90071992547409931234"]);
});

test("exports exact seven-column order while preserving blank and zero", async () => {
  globalThis.XLSX = StyleXLSX;
  const count = importInventory(await fs.readFile(fixture), "PreChanges.xlsx");
  count.products[0].display = "0";
  count.products[0].cupboard = "1.5";
  count.products[0].storeRoom = "-1";
  count.products[0].confirmed = true;
  const bytes = exportInventory(count);
  const wb = XLSX.read(bytes, { type: "array", raw: true });
  assert.deepEqual(wb.SheetNames, ["Store Inventory Journal"]);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  assert.deepEqual(rows[0], ["Category", "Item No.(PLU)", "Description", "On Hand Qty.", "Display", "Cupboard", "Store Room"]);
  assert.deepEqual(rows[1].slice(3), [8, 0, 1.5, -1]);
  assert.deepEqual(rows[2].slice(4), ["", "", ""]);
  globalThis.XLSX = XLSX;
});

test("exports bold headers, alternating rows, and visible borders", async () => {
  globalThis.XLSX = StyleXLSX;
  const count = importInventory(await fs.readFile(fixture), "PreChanges.xlsx");
  const bytes = exportInventory(count);
  const temp = path.join(os.tmpdir(), `lush-export-${Date.now()}.xlsx`);
  await fs.writeFile(temp, Buffer.from(bytes));
  const stylesXml = execFileSync("unzip", ["-p", temp, "xl/styles.xml"], { encoding: "utf8" });
  await fs.unlink(temp);
  assert.match(stylesXml, /<b\/>/);
  assert.match(stylesXml, /<bottom style="thin">/);
  assert.match(stylesXml, /fgColor rgb="FFD9EEF6"/);
  assert.match(stylesXml, /fgColor rgb="FFFFFFFF"/);
  globalThis.XLSX = XLSX;
});
