import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCountValue,
  productStatus,
  productTotals,
  summarizeProducts,
} from "../src/count-model.js";

const product = (overrides = {}) => ({
  onHand: 5,
  display: "",
  cupboard: "",
  storeRoom: "",
  ...overrides,
});

test("blank remains uncounted while zero is a valid count", () => {
  assert.deepEqual(parseCountValue(""), { kind: "blank", value: null });
  assert.deepEqual(parseCountValue("0"), { kind: "valid", value: 0 });
});

test("decimal and negative values remain valid numeric counts", () => {
  assert.deepEqual(parseCountValue("1.45"), { kind: "valid", value: 1.45 });
  assert.deepEqual(parseCountValue("-2"), { kind: "valid", value: -2 });
  assert.equal(parseCountValue("2x").kind, "invalid");
});

test("a product is complete only after all three locations are valid", () => {
  assert.equal(productStatus(product()).key, "not-started");
  assert.equal(productStatus(product({ display: "0" })).key, "in-progress");
  assert.equal(productStatus(product({ display: "0", cupboard: "2", storeRoom: "3" })).key, "matching");
});

test("totals and variance use all three location counts", () => {
  assert.deepEqual(
    productTotals(product({ display: "1.5", cupboard: "2", storeRoom: "0" })),
    { complete: true, countedTotal: 3.5, variance: -1.5 },
  );
});

test("summary classifies incomplete, matching, under, and over products", () => {
  const summary = summarizeProducts([
    product(),
    product({ display: "1", cupboard: "2", storeRoom: "2" }),
    product({ display: "1", cupboard: "1", storeRoom: "1" }),
    product({ display: "4", cupboard: "2", storeRoom: "0" }),
  ]);
  assert.deepEqual(summary, { total: 4, complete: 3, incomplete: 1, matching: 1, under: 1, over: 1, percent: 75 });
});
