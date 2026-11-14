import { parseCountValue } from "./count-model.js";
import { addMonths, parseDate } from "./expiry-model.js";
import { validateCountNaming } from "./count-naming.js";

export const OOD_BUCKETS = [
  ["pastDue", "Already OOD"],
  ["month1", "1 Month to OOD"],
  ["month2", "2 Months to OOD"],
  ["month3", "3 Months to OOD"],
  ["later", "More than 3 Months to OOD"],
];

export function createOODCount(source, checkedOn, shelfLifeMonths) {
  const { id, fileName, importedAt, postingDate, warnings } = source;
  return { id, fileName, importedAt, postingDate, warnings, checkedOn, shelfLifeMonths, countMode: "ood",
    products: source.products.map(({ id, category, plu, description, onHand, department, unit }) => ({
      id, category, plu, description, onHand, department, unit, confirmed: false, entered: [],
      buckets: Object.fromEntries(OOD_BUCKETS.map(([key]) => [key, key === "later" ? "" : "0"])),
    })),
  };
}

export function oodWindows(checkedOn) {
  return [checkedOn, ...[1, 2, 3].map((months) => addMonths(checkedOn, months))];
}

export function updateOODRow(count, id, key, value) {
  return { ...count, products: count.products.map((p) => p.id !== id ? p : {
    ...p, confirmed: true,
    entered: key === null ? OOD_BUCKETS.map(([name]) => name) : [...new Set([...(p.entered || []), key])],
    buckets: key === null ? Object.fromEntries(OOD_BUCKETS.map(([name]) => [name, "0"])) : { ...p.buckets, [key]: value },
  }) };
}

export function oodBucketValue(product, key, complete) {
  if (!complete && !product.entered?.includes(key)) return null;
  const parsed = parseCountValue(product.buckets[key]);
  return parsed.kind === "valid" && parsed.value >= 0 ? parsed.value : null;
}

export function oodTotals(product) {
  const values = OOD_BUCKETS.map(([key]) => parseCountValue(product.buckets[key]));
  const total = values.reduce((sum, value) => sum + value.value, 0);
  const invalid = values.some((value) => value.kind === "invalid" || value.value < 0) || !Number.isFinite(total);
  const complete = product.confirmed && values.every((value) => value.kind === "valid") && !invalid;
  if (!complete) return { complete: false, total: null, variance: null, state: invalid ? "invalid" : product.confirmed ? "in-progress" : "not-started" };
  const diff = total - product.onHand;
  const variance = Math.abs(diff) < 1e-9 ? 0 : diff;
  return { complete: true, total, variance, state: variance < 0 ? "under" : variance > 0 ? "over" : "matching" };
}

export function archiveOODCount(vault, archivedAt = new Date().toISOString()) {
  if (!vault.oodDraft?.products.some((p) => OOD_BUCKETS.some(([key]) => oodBucketValue(p, key, oodTotals(p).complete) !== null))) throw new Error("Enter at least one valid quantity before saving to history.");
  const saved = structuredClone({ ...vault.oodDraft, countMode: "ood", archivedAt });
  return { ...vault, oodDraft: null, oodCounts: [saved, ...(vault.oodCounts || [])] };
}

export function validateOODRecords(vault) {
  const invalid = () => { throw new Error("Invalid OOD count in backup."); };
  const stamp = (s) => typeof s === "string" && Number.isFinite(Date.parse(s));
  const ids = new Set();
  function check(count, archived) {
    if (!count || typeof count.id !== "string" || !count.id || ids.has(count.id) ||
        typeof count.fileName !== "string" || !stamp(count.importedAt) ||
        (archived ? !stamp(count.archivedAt) : count.archivedAt != null) ||
        !Number.isInteger(count.shelfLifeMonths) || count.shelfLifeMonths < 1 || count.shelfLifeMonths > 120 ||
        !Array.isArray(count.products) || !count.products.length ||
        !Array.isArray(count.warnings) || count.warnings.some((s) => typeof s !== "string")) invalid();
    ids.add(count.id);
    validateCountNaming(count, true);
    parseDate(count.checkedOn); oodWindows(count.checkedOn);
    if (count.postingDate != null) parseDate(count.postingDate);
    const rowIds = new Set();
    for (const p of count.products) {
      if (!p || !["id", "plu", "description", "category"].every((key) => typeof p[key] === "string" && p[key]) ||
          rowIds.has(p.id) || !["department", "unit"].every((key) => p[key] == null || typeof p[key] === "string") ||
          !Number.isFinite(p.onHand) || typeof p.confirmed !== "boolean" ||
          (p.entered != null && (!Array.isArray(p.entered) || p.entered.some((key) => !OOD_BUCKETS.some(([name]) => name === key)))) ||
          !p.buckets || !OOD_BUCKETS.every(([key]) => typeof p.buckets[key] === "string")) invalid();
      rowIds.add(p.id);
    }
  }
  if (vault.oodCounts !== undefined && !Array.isArray(vault.oodCounts)) invalid();
  for (const count of vault.oodCounts || []) check(count, true);
  if (vault.oodDraft != null) check(vault.oodDraft, false);
}
