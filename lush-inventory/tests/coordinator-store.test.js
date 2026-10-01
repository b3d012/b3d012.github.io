import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import * as store from "../src/coordinator-store.js";
import { saveActiveCount, loadActiveCount } from "../src/count-store.js";
const OWNER_PIN = process.env.LUSH_TEST_PIN;
if (!OWNER_PIN) throw new Error("Set LUSH_TEST_PIN to the configured owner PIN before running vault tests.");

test("PIN vault encrypts private notes and stays closed after wrong PIN", async () => {
  await assert.rejects(() => store.unlockVault("9999"), /PIN/i);
  let vault = await store.unlockVault(OWNER_PIN);
  vault.events.push({ at: "2026-10-01", action: "private tester note" });
  await store.saveVault(vault);
  const envelope = await store.loadEnvelope();
  assert.ok(envelope.ciphertext);
  assert.ok(!JSON.stringify(envelope).includes("private tester note"));
  store.lockVault();
  await assert.rejects(() => store.saveVault(vault), /unlock|locked/i);
  await assert.rejects(() => store.unlockVault("0000"), /PIN|corrupt/i);
  assert.equal((await store.unlockVault(OWNER_PIN)).events[0].action, "private tester note");
});
test("PIN change preserves vault and invalidates the old PIN", async () => {
  await store.changePin(OWNER_PIN, "4567");
  store.lockVault();
  await assert.rejects(() => store.unlockVault(OWNER_PIN), /PIN|corrupt/i);
  assert.equal((await store.unlockVault("4567")).events[0].action, "private tester note");
  await store.changePin("4567", OWNER_PIN);
  store.lockVault();
});
test("large history encrypts and serial saves keep the newest records", async () => {
  const vault = await store.unlockVault(OWNER_PIN);
  vault.events.push({ at: "2026-10-01", action: "x".repeat(180000) });
  const first = store.saveVault(vault);
  vault.events.push({ at: "2026-10-01", action: "latest" });
  const second = store.saveVault(vault);
  await Promise.all([first, second]);
  store.lockVault();
  const restored = await store.unlockVault(OWNER_PIN);
  assert.equal(restored.events.at(-1).action, "latest");
  assert.equal(restored.events.at(-2).action.length, 180000);
  store.lockVault();
});
test("a stale second tab cannot overwrite a newer private record", async () => {
  const other = await import("../src/coordinator-store.js?second-tab");
  const current = await store.unlockVault(OWNER_PIN);
  const stale = await other.unlockVault(OWNER_PIN);
  current.events.push({ at: "2026-10-01", action: "first tab preserved" });
  await store.saveVault(current);
  stale.events.push({ at: "2026-10-01", action: "stale tab" });
  await assert.rejects(() => other.saveVault(stale), /another tab|changed/i);
  store.lockVault(); other.lockVault();
  assert.equal((await store.unlockVault(OWNER_PIN)).events.at(-1).action, "first tab preserved");
  store.lockVault();
});
test("archive and active marker commit together, including a guarded-write scheduling failure", async () => {
  const vault = await store.unlockVault(OWNER_PIN), before = await store.loadEnvelope();
  const count = { schemaVersion: 1, id: "atomic", fileName: "atomic.xlsx", products: [{ id: "p", plu: "1", category: "A", description: "Item", onHand: 2, display: "2", cupboard: "0", storeRoom: "0" }] };
  await saveActiveCount(count);
  const marked = { ...count, archivedAt: "2026-10-01T10:00:00Z" };
  vault.archives.push({ id: count.id, count, archivedAt: marked.archivedAt, outcomes: {}, revisions: [] });
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) { if (this.name === "counts") throw new Error("Injected archive failure"); return put.apply(this, args); };
  try { await assert.rejects(() => store.saveVault(vault, marked), /failure|failed/i); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await loadActiveCount(), count); assert.deepEqual(await store.loadEnvelope(), before);
  await store.saveVault(vault, marked);
  assert.deepEqual(await loadActiveCount(), marked);
  store.lockVault();
  assert.equal((await store.unlockVault(OWNER_PIN)).archives.at(-1).id, marked.id);
  store.lockVault();
});
