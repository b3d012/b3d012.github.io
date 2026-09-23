import test from "node:test";
import assert from "node:assert/strict";
import { filterProducts, filterReviewProducts, updateProductField } from "../src/app-logic.js";

const products = [
  { id: "1", category: "SHAMPOO", plu: "100", description: "Big Shampoo", onHand: 2, display: "", cupboard: "", storeRoom: "" },
  { id: "2", category: "GIFT", plu: "2001063000000", description: "Garden Party", onHand: 3, display: "1", cupboard: "1", storeRoom: "1" },
  { id: "3", category: "GIFT", plu: "300", description: "Rose", onHand: 5, display: "1", cupboard: "1", storeRoom: "1" },
];

test("count list filters by category and case-insensitive name or PLU", () => {
  assert.deepEqual(filterProducts(products, "GIFT", "garden").map((p) => p.id), ["2"]);
  assert.deepEqual(filterProducts(products, "ALL", "2001063000000").map((p) => p.id), ["2"]);
});

test("review list filters incomplete, matching, under, and over", () => {
  assert.deepEqual(filterReviewProducts(products, "incomplete").map((p) => p.id), ["1"]);
  assert.deepEqual(filterReviewProducts(products, "matching").map((p) => p.id), ["2"]);
  assert.deepEqual(filterReviewProducts(products, "under").map((p) => p.id), ["3"]);
});

test("field update preserves zero and rejects invalid numeric text", () => {
  const zeroed = updateProductField(products, "1", "display", "0");
  assert.equal(zeroed[0].display, "0");
  assert.throws(() => updateProductField(products, "1", "display", "2x"), /number/i);
  assert.equal(products[0].display, "");
});
