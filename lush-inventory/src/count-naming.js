import { dubaiToday, parseDate } from "./expiry-model.js";

export const REGULAR_MODES = [["pre-inventory", "Pre Inventory"], ["cycle", "Cycle Count"]];
const labels = new Map([...REGULAR_MODES, ["ood", "OOD Count"]]);
const tidyAreas = (s) => s.replace(/[\s\u0000-\u001f]+/g, " ").trim();
const titleCase = (s) => s === s.toUpperCase() ? s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s;

export function countAreas(count) {
  const areas = new Map();
  for (const row of count.products) {
    const area = tidyAreas(row.department?.trim() || row.category || "");
    if (area && !areas.has(area.toLowerCase())) areas.set(area.toLowerCase(), titleCase(area));
  }
  return new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" }).format([...areas.values()]) || "Unspecified";
}

export function countModeLabel(count) {
  return labels.get(count?.countMode) || "Cycle Count";
}

export function startRegularCount(source, countMode, areas, now = new Date()) {
  if (!REGULAR_MODES.some(([key]) => key === countMode)) throw new Error("Choose Pre Inventory or Cycle Count.");
  return { ...source, countMode, countDate: dubaiToday(now), areaLabel: tidyAreas(areas).slice(0, 200).trimEnd() || undefined };
}

export function countTitle(count) {
  const mode = count.countMode === "pre-inventory" ? "Pre_Inventory" : labels.get(count.countMode);
  const date = count.countMode === "ood" ? count.checkedOn : count.countDate;
  if (!mode || !date) return count.fileName;
  return [mode, "Area " + (count.areaLabel || countAreas(count)), date.split("-").reverse().join(".")].join(" - ");
}

export function namedWorkbook(count) {
  if (!count.countMode) return null;
  const title = countTitle(count).replace(/[\u0000-\u001f<>:"\\|?*]/g, " ").replace(/\s*\/\s*/g, " - ").replace(/\s+/g, " ").trim();
  return (title.length <= 175 ? title : title.slice(0, 158).trimEnd() + "…" + title.slice(-13)) + ".xlsx";
}

export function validateCountNaming(count, ood = false) {
  if (count.countMode != null && !(ood ? count.countMode === "ood" : REGULAR_MODES.some(([key]) => key === count.countMode))) throw new Error("Invalid count mode in backup.");
  if ((count.countMode && !ood) || count.countDate != null) parseDate(count.countDate);
  if (count.areaLabel != null && (typeof count.areaLabel !== "string" || !count.areaLabel.trim() || count.areaLabel.length > 200)) throw new Error("Invalid area name in backup.");
}
