import { parseCountValue, productStatus } from "./count-model.js";

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
  const parsed = parseCountValue(raw);
  if (parsed.kind === "invalid") throw new Error("Enter a valid number.");
  return products.map((product) => product.id === productId ? { ...product, [field]: String(raw).trim() } : product);
}
