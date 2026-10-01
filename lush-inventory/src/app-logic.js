import { parseCountValue, productStatus, recordCountChange } from "./count-model.js";

export function filterProducts(products, category = "ALL", query = "") {
  const needle = String(query).trim().toLowerCase();
  return products.filter((product) => {
    const inCategory = category === "ALL" || product.category === category;
    const searchable = `${product.description} ${product.plu}`.toLowerCase();
    return inCategory && (!needle || searchable.includes(needle));
  });
}

export function filterReviewProducts(products, filter = "all") {
  if (filter === "all") return [...products];
  return products.filter((product) => {
    const key = productStatus(product).key;
    return filter === "incomplete" ? ["not-started", "in-progress", "invalid"].includes(key) : key === filter;
  });
}

export function updateProductField(products, productId, field, raw) {
  if (!["display", "cupboard", "storeRoom"].includes(field)) throw new Error("Unknown inventory location.");
  return products.map((product) => {
    if (product.id !== productId) return product;
    const changes = { [field]: String(raw).trim(), provenance: "physical-recount" };
    changes.confirmed = ["display", "cupboard", "storeRoom"].every((key) => parseCountValue(changes[key] ?? product[key]).kind === "valid");
    return recordCountChange(product, changes, "Edit count");
  });
}
