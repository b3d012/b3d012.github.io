import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import * as backups from "../src/full-backup.js";
import { saveActiveCount, loadActiveCount, writeRecords } from "../src/count-store.js";
import { unlockVault, saveVault, loadEnvelope, lockVault, validateVault, emptyVault, decryptEnvelope } from "../src/coordinator-store.js";
const OWNER_PIN = process.env.LUSH_TEST_PIN;
if (!OWNER_PIN) throw new Error("Set LUSH_TEST_PIN to the configured owner PIN before running vault tests.");
const count = { schemaVersion: 1, fileName: "keep.xlsx", products: [{ id: "p", plu: "1", category: "A", description: "Item", onHand: 2, display: "0", cupboard: "", storeRoom: "" }] };
test("full backup validates before atomic replacement and preserves both stores on failure", async () => {
  await saveActiveCount(count);
  const vault = await unlockVault(OWNER_PIN);
  vault.events.push({ at: "2026-10-01", action: "private note" });
  await saveVault(vault);
  const envelope = await loadEnvelope();
  const json = backups.createFullBackup(count, envelope);
  assert.ok(!json.includes("private note"));
  const tampered = JSON.parse(json);
  tampered.envelope.ciphertext = (tampered.envelope.ciphertext[0] === "A" ? "B" : "A") + tampered.envelope.ciphertext.slice(1);
  for (const bad of ["{broken", JSON.stringify({ backupVersion: 99 }), JSON.stringify(tampered)]) {
    await assert.rejects(() => backups.validateFullBackup(bad, OWNER_PIN));
    assert.deepEqual(await loadActiveCount(), count);
    assert.deepEqual(await loadEnvelope(), envelope);
  }
  await assert.rejects(() => backups.validateFullBackup(json, "9999"), /PIN|backup/i);
  const verified = await backups.validateFullBackup(json, OWNER_PIN);
  await backups.replaceFullState(verified);
  assert.deepEqual(await loadActiveCount(), count);
  assert.deepEqual(await loadEnvelope(), envelope);
  lockVault();
});
test("unvalidated full state cannot overwrite anything", async () => {
  await assert.rejects(() => backups.replaceFullState({ activeCount: null, envelope: null }), /validate/i);
  assert.deepEqual(await loadActiveCount(), count);
});
test("a synchronous second-store failure rolls back the first write", async () => {
  const before = await loadEnvelope();
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) { if (this.name === "coordinator") throw new Error("Injected storage failure"); return originalPut.apply(this, args); };
  try {
    await assert.rejects(() => writeRecords([{ store: "counts", key: "active", value: { ...count, fileName: "replacement.xlsx" } }, { store: "coordinator", key: "vault", value: before }]), /failure/i);
  } finally { IDBObjectStore.prototype.put = originalPut; }
  assert.deepEqual(await loadActiveCount(), count);
  assert.deepEqual(await loadEnvelope(), before);
});
test("backup structure validates nested event, outcome, revision and date records", () => {
  const archive = { id: "a", count: { ...count, id: "a" }, archivedAt: "2026-10-01T10:00:00Z", outcomes: {}, revisions: [] };
  const batch = { id: "b", plu: "1", department: "HAIR", description: "Item", productionDate: "2026-01-01", shelfLifeMonths: 7, quantity: 2, unit: "PCS", observedAt: "2026-10-01T10:00:00Z", status: "active", events: [] };
  const valid = { ...emptyVault(), archives: [archive], expiryRecords: [batch] };
  for (const mutate of [
    (v) => v.archives[0].revisions.push(null),
    (v) => v.archives[0].outcomes.p = { declaredQuantity: null, reason: "unresolved", note: "", resolved: false, links: [null] },
    (v) => v.expiryRecords[0].events.push(null),
    (v) => v.expiryRecords[0].observedAt = "invalid date",
    (v) => v.events.push(null),
    (v) => v.archives[0].count.products[0].provenance = { wrong: true },
    (v) => v.settings = { shelfLifeMonths: -1 }
  ]) {
    const bad = structuredClone(valid); mutate(bad);
    assert.throws(() => validateVault(bad), /invalid|backup|date|record|life/i);
  }
});
test("correctly encrypted malformed private records cannot replace either store", async () => {
  const before = await loadEnvelope(), active = await loadActiveCount();
  const { vault, key } = await decryptEnvelope(before, OWNER_PIN);
  vault.events.push(null);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(vault)));
  const broken = { ...before, iv: Buffer.from(iv).toString("base64"), ciphertext: Buffer.from(ciphertext).toString("base64") };
  const json = backups.createFullBackup(null, broken);
  await assert.rejects(() => backups.validateFullBackup(json, OWNER_PIN), /invalid|record/i);
  assert.deepEqual(await loadActiveCount(), active); assert.deepEqual(await loadEnvelope(), before);
});
