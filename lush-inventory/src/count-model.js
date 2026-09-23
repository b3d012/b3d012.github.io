const COMPLETE_STATES = new Set(["matching", "under", "over"]);

export function parseCountValue(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { kind: "blank", value: null };
  }
  const text = String(raw).trim();
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return { kind: "invalid", value: null };
  const value = Number(text);
  return Number.isFinite(value) ? { kind: "valid", value } : { kind: "invalid", value: null };
}

export function productTotals(product) {
  const values = [product.display, product.cupboard, product.storeRoom].map(parseCountValue);
  const complete = values.every((entry) => entry.kind === "valid");
  if (!complete) return { complete: false, countedTotal: null, variance: null };
  const countedTotal = values.reduce((sum, entry) => sum + entry.value, 0);
  return { complete: true, countedTotal, variance: countedTotal - Number(product.onHand || 0) };
}

export function productStatus(product) {
  const values = [product.display, product.cupboard, product.storeRoom].map(parseCountValue);
  if (values.some((entry) => entry.kind === "invalid")) return { key: "invalid", label: "Check value" };
  const entered = values.filter((entry) => entry.kind === "valid").length;
  if (entered === 0) return { key: "not-started", label: "Not started" };
  if (entered < 3) return { key: "in-progress", label: "In progress" };
  const { variance } = productTotals(product);
  if (Math.abs(variance) < 1e-9) return { key: "matching", label: "Matches" };
  return variance < 0 ? { key: "under", label: "Under" } : { key: "over", label: "Over" };
}

export function summarizeProducts(products) {
  const summary = { total: products.length, complete: 0, incomplete: 0, matching: 0, under: 0, over: 0, percent: 0 };
  for (const product of products) {
    const key = productStatus(product).key;
    if (COMPLETE_STATES.has(key)) {
      summary.complete += 1;
      summary[key] += 1;
    } else {
      summary.incomplete += 1;
    }
  }
  summary.percent = summary.total ? Math.round((summary.complete / summary.total) * 100) : 0;
  return summary;
}
