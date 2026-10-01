import { productTotals } from "./count-model.js";
import { validateCountBackup } from "./count-store.js";

export const RESOLUTIONS = [
  ["unresolved", "Unresolved"], ["recount-correction", "Recount correction"], ["wrong-punch", "Suspected wrong punch"], ["plu-mismatch", "Old/new PLU mismatch"],
  ["tester-pending", "Tester wastage pending"], ["tester-confirmed", "Tester wastage confirmed"], ["damage-transfer", "Damage / transfer explanation"],
  ["surplus-review", "Surplus retained for review"], ["other", "Other explanation"]
];
const knownCost = (product) => typeof product.cost === "number" && Number.isFinite(product.cost) && product.cost >= 0 && Boolean(product.unit);
const identity = (product) => `${product.department || "Unknown department"}::${product.plu}::${product.unit || "Unknown unit"}`;
export const isPhysical = (product) => ["physical-recount", "legacy-count"].includes(product.provenance);

export function archiveCount(vault, count, now = new Date().toISOString()) {
  validateCountBackup(count);
  if (!count.id) throw new Error("This count needs an identifier before archiving.");
  const next = structuredClone(vault);
  if (next.archives.some((archive) => archive.id === count.id)) return next;
  next.archives.push({ id: count.id, count: structuredClone(count), archivedAt: now, outcomes: {}, revisions: [] });
  next.events.push({ at: now, action: "Archive count", archiveId: count.id });
  return next;
}

export function reviseOutcome(vault, archiveId, productId, change, now = new Date().toISOString()) {
  const next = structuredClone(vault);
  const archive = next.archives.find((entry) => entry.id === archiveId);
  if (!archive?.count.products.some((product) => product.id === productId)) throw new Error("Archived product not found.");
  const previous = archive.outcomes[productId] || { declaredQuantity: null, reason: "unresolved", note: "", resolved: false, links: [] };
  const outcome = { ...previous, ...change, updatedAt: now };
  if (outcome.declaredQuantity !== null && (typeof outcome.declaredQuantity !== "number" || !Number.isFinite(outcome.declaredQuantity))) throw new Error("Declared quantity must be a valid number or left blank.");
  if (!RESOLUTIONS.some(([key]) => key === outcome.reason)) throw new Error("Choose a valid resolution reason.");
  outcome.note = String(outcome.note || "");
  outcome.resolved = Boolean(outcome.resolved);
  if (outcome.reason === "tester-pending" || outcome.reason === "unresolved" || outcome.reason === "surplus-review") outcome.resolved = false;
  archive.outcomes[productId] = outcome;
  archive.revisions.push({ at: now, productId, previous, outcome: structuredClone(outcome) });
  return next;
}

export function linkDiscrepancies(vault, references, note, now = new Date().toISOString()) {
  const unique = [...new Map(references.map((ref) => [`${ref.archiveId}:${ref.productId}`, ref])).values()];
  if (unique.length < 2 || !String(note).trim()) throw new Error("Select at least two different discrepancies and explain the link.");
  let next = structuredClone(vault);
  for (const ref of unique) {
    const archive = next.archives.find((entry) => entry.id === ref.archiveId);
    const product = archive?.count.products.find((row) => row.id === ref.productId);
    if (!product || !productTotals(product).complete || !productTotals(product).variance) throw new Error("Only completed discrepancies can be linked.");
    const links = [...(archive.outcomes[ref.productId]?.links || []), { at: now, references: unique, note: String(note).trim() }];
    next = reviseOutcome(next, ref.archiveId, ref.productId, { links }, now);
  }
  return next;
}

export function compareSnapshots(previous, current) {
  return current.products.map((product) => {
    const before = previous.products.filter((row) => row.plu === product.plu && row.department === product.department);
    if (!before.length) return null;
    const compatible = before.length === 1 && before[0].unit && before[0].unit === product.unit && current.products.filter((row) => row.plu === product.plu && row.department === product.department).length === 1;
    const dated = previous.postingDate && current.postingDate && current.postingDate > previous.postingDate;
    return { product, previousOnHand: before.length === 1 ? before[0].onHand : null, change: compatible && dated ? product.onHand - before[0].onHand : null, from: previous.postingDate, to: current.postingDate, warning: !compatible ? "Conflicting PLU or units" : !dated ? "Need distinct, chronological snapshot dates" : before[0].cost !== product.cost ? "Unit cost changed between snapshots" : null };
  }).filter(Boolean);
}

export function historySummary(vault, activeCount) {
  const summary = { shortageValue: 0, surplusValue: 0, unknownCost: 0, physicalObservations: 0, accepted: 0, pending: [], repeatShortages: [], departments: [] };
  const shortages = new Map(), departments = new Map();
  const sorted = [...vault.archives].sort((a, b) => a.archivedAt.localeCompare(b.archivedAt));
  const latest = (...values) => values.filter(Boolean).sort().at(-1) || null;
  const cover = (count, completedAt) => {
    for (const department of new Set(count.products.map((p) => p.department || "Unknown department"))) {
      const rows = count.products.filter((p) => (p.department || "Unknown department") === department);
      const old = departments.get(department);
      const countedAt = rows.every((p) => productTotals(p).complete) ? latest(...rows.map((p) => p.countedAt)) || completedAt : null;
      departments.set(department, { department, lastSnapshot: latest(old?.lastSnapshot, count.postingDate), lastImport: latest(old?.lastImport, count.importedAt), lastCount: latest(old?.lastCount, countedAt) });
    }
  };
  for (const archive of sorted) {
    cover(archive.count, archive.archivedAt);
    const identities = new Map();
    for (const p of archive.count.products) identities.set(identity(p), (identities.get(identity(p)) || 0) + 1);
    for (const product of archive.count.products) {
      const totals = productTotals(product);
      if (!totals.complete) continue;
      if (!isPhysical(product)) { summary.accepted += 1; continue; }
      summary.physicalObservations += 1;
      const key = identity(product);
      const outcome = archive.outcomes[product.id];
      if (!totals.variance) { shortages.delete(key); continue; }
      if (knownCost(product)) {
        const value = totals.variance * product.cost;
        if (value < 0) summary.shortageValue -= value;
        else summary.surplusValue += value;
      } else summary.unknownCost += 1;
      if (!outcome?.resolved) summary.pending.push({ archiveId: archive.id, product, variance: totals.variance, outcome });
      if (totals.variance < 0 && identities.get(key) === 1 && (!outcome || outcome.reason === "unresolved") && !outcome?.resolved) {
        const old = shortages.get(key);
        shortages.set(key, { key, product, observations: (old?.observations || 0) + 1, latestVariance: totals.variance, dates: [...(old?.dates || []), archive.count.postingDate || archive.archivedAt.slice(0, 10)] });
      } else shortages.delete(key);
    }
  }
  if (activeCount) cover(activeCount, activeCount.updatedAt);
  summary.repeatShortages = [...shortages.values()].filter((entry) => entry.observations >= 2);
  summary.departments = [...departments.values()];
  return summary;
}
