import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  loadActiveCount,
  saveActiveCount,
  clearActiveCount,
  createBackup,
  restoreBackup,
} from "../src/count-store.js";

const sample = () => ({
  schemaVersion: 1,
  fileName: "week.xlsx",
  importedAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
  products: [{ id: "1::0", category: "TEST", plu: "1", description: "Item", onHand: 2, display: "0", cupboard: "", storeRoom: "" }],
});

test("saves and reloads an active count without losing zero", async () => {
  await clearActiveCount();
  await saveActiveCount(sample());
  const restored = await loadActiveCount();
  assert.equal(restored.products[0].display, "0");
  assert.equal(restored.products[0].cupboard, "");
});

test("backup and restore round-trip a valid schema", async () => {
  const json = createBackup(sample());
  await restoreBackup(json);
  assert.deepEqual(await loadActiveCount(), JSON.parse(json));
});

test("invalid backup is rejected without replacing the active count", async () => {
  const current = sample();
  await saveActiveCount(current);
  await assert.rejects(() => restoreBackup(JSON.stringify({ schemaVersion: 99, products: [] })), /backup/i);
  assert.deepEqual(await loadActiveCount(), current);
});
