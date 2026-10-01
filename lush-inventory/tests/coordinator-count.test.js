import test from "node:test";
import assert from "node:assert/strict";
import * as model from "../src/count-model.js";
import { updateProductField } from "../src/app-logic.js";

const row = (extra = {}) => ({ id: "p", plu: "01", category: "TEST", description: "Item", onHand: 5, display: "0", cupboard: "0", storeRoom: "0", confirmed: false, provenance: "untouched", ...extra });

test("zero defaults stay untouched until confirmed", () => {
  assert.equal(model.productStatus(row()).key, "not-started");
  assert.equal(model.productTotals(row()).complete, false);
  assert.equal(model.productStatus(model.confirmZero(row(), "2026-10-01T10:00:00Z")).key, "under");
});
test("MAX preserves decimal and negative On Hand and records acceptance", () => {
  for (const value of [1.45, -2, 0]) {
    const accepted = model.applyMax(row({ onHand: value }), "2026-10-01T10:00:00Z");
    assert.equal(model.productStatus(accepted).key, "matching");
    assert.equal(accepted.display, String(value));
    assert.equal(accepted.provenance, "carried-forward");
    assert.equal(accepted.events.length, 1);
  }
});
test("editing MAX becomes a physical recount and invalid text is preserved as incomplete", () => {
  const accepted = model.applyMax(row());
  const edited = updateProductField([accepted], "p", "display", "4")[0];
  assert.equal(edited.provenance, "physical-recount");
  assert.equal(model.productStatus(edited).key, "under");
  const invalid = updateProductField([edited], "p", "display", "4x")[0];
  assert.equal(invalid.display, "4x");
  assert.equal(model.productStatus(invalid).key, "invalid");
  assert.equal(model.productTotals(invalid).complete, false);
  assert.equal(model.productStatus(updateProductField([edited], "p", "cupboard", "")[0]).key, "in-progress");
});
test("legacy migration retains blank and deliberately counted zero rows", () => {
  const legacy = { schemaVersion: 1, products: [row({ display: "", cupboard: "", storeRoom: "", confirmed: undefined }), row({ confirmed: undefined })] };
  const migrated = model.migrateCount(legacy);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.products[0].display, "");
  assert.equal(migrated.products[0].confirmed, false);
  assert.equal(migrated.products[1].confirmed, true);
  assert.equal(migrated.products[1].provenance, "legacy-count");
  assert.equal(legacy.schemaVersion, 1);
});
test("editing an archived count creates a linked amendment rather than changing its identity", () => {
  const original = { id: "archived", archivedAt: "2026-10-01T10:00:00Z", products: [row()] };
  const editing = model.prepareCountEdit(original);
  assert.notEqual(editing.id, "archived");
  assert.equal(editing.supersedesId, "archived");
  assert.equal(editing.archivedAt, null);
  assert.equal(original.id, "archived");
  assert.equal(model.prepareCountEdit(editing).id, editing.id);
});
