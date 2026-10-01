import { productTotals } from "./count-model.js";
import { offShelfDate } from "./expiry-model.js";

const REQUIRED = [
  { key: "category", label: "Category", aliases: ["category"] },
  { key: "plu", label: "Item No.(PLU)", aliases: ["itemnoplu"] },
  { key: "description", label: "Description", aliases: ["description"] },
  { key: "onHand", label: "On Hand Qty.", aliases: ["onhandqty"] },
];

export const OUTPUT_HEADERS = ["Category", "Item No.(PLU)", "Description", "On Hand Qty.", "Display", "Cupboard", "Store Room"];

export function normalizeHeader(text) {
  return String(text ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function lib() {
  if (!globalThis.XLSX) throw new Error("Spreadsheet engine is unavailable. Reload the app and try again.");
  return globalThis.XLSX.default || globalThis.XLSX;
}

function toIdentifier(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? String(value) : String(value).trim();
}

function toNumber(value, rowNumber, label) {
  if (value === "" || value === null || value === undefined) throw new Error(`Row ${rowNumber}: ${label} is blank.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Row ${rowNumber}: ${label} is not a valid number.`);
  return number;
}

export function importInventory(arrayBuffer, fileName = "inventory.xlsx") {
  const XLSX = lib();
  let workbook;
  try {
    workbook = XLSX.read(arrayBuffer, { type: "array", raw: true, cellDates: false });
  } catch {
    throw new Error("This Excel file could not be read. Please use the original .xlsx export.");
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook does not contain a worksheet.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
  if (!rows.length) throw new Error("The worksheet is empty.");
  const normalized = rows[0].map(normalizeHeader);
  const columns = {};
  for (const field of REQUIRED) {
    const matches = normalized.flatMap((header, index) => field.aliases.includes(header) ? [index] : []);
    if (!matches.length) throw new Error(`Missing required column: ${field.label}.`);
    if (matches.length > 1) throw new Error(`Duplicate required column: ${field.label}. Remove the duplicate and try again.`);
    columns[field.key] = matches[0];
  }
  const products = [];
  const invalidRows = [];
  const warnings = [];
  const optional = (row, name) => { const index = normalized.indexOf(normalizeHeader(name)); return index < 0 ? null : row[index]; };
  const optionalNumber = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  const optionalText = (value) => value === null || value === undefined || String(value).trim() === "" ? null : String(value).trim();
  const readDate = (value) => {
    if (typeof value === "number") {
      const date = XLSX.SSF.parse_date_code(value);
      return date ? `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}` : null;
    }
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  };
  const dates = new Set();
  const seen = new Set();
  rows.slice(1).forEach((row, index) => {
    if (!row.some((cell) => cell !== null && String(cell).trim() !== "")) return;
    const rowNumber = index + 2;
    const category = String(row[columns.category] ?? "").trim();
    const plu = toIdentifier(row[columns.plu]);
    const description = String(row[columns.description] ?? "").trim();
    if (!category || !plu || !description) {
      invalidRows.push(rowNumber);
      return;
    }
    if (seen.has(plu)) warnings.push(`Duplicate PLU ${plu}: review the separate rows before historical comparisons.`);
    seen.add(plu);
    const postingDate = readDate(optional(row, "Posting Date"));
    if (postingDate) dates.add(postingDate);
    products.push({
      id: `${plu}::${products.length}`,
      category,
      plu,
      description,
      onHand: toNumber(row[columns.onHand], rowNumber, "On Hand Qty."),
      department: optionalText(optional(row, "Department")),
      unit: optionalText(optional(row, "Unit of Measure Code")),
      season: optionalText(optional(row, "Season")),
      cost: optionalNumber(optional(row, "Cost (AED)")),
      display: "0",
      cupboard: "0",
      storeRoom: "0",
      confirmed: false,
      provenance: "untouched",
      events: [],
    });
  });
  if (invalidRows.length) throw new Error(`Rows missing Category, PLU, or Description: ${invalidRows.slice(0, 12).join(", ")}${invalidRows.length > 12 ? "…" : ""}.`);
  if (!products.length) throw new Error("No product rows were found in the worksheet.");
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    fileName,
    sheetName,
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    postingDate: dates.size === 1 ? [...dates][0] : null,
    warnings: dates.size > 1 ? [...warnings, "Multiple posting dates found. Confirm the snapshot date before archiving."] : warnings,
    sourceSummary: { totalCost: optionalNumber(optional(rows[1] || [], "Total Cost (AED)")), totalOnHand: optionalNumber(optional(rows[1] || [], "Total Hand On Qty.")) },
    products,
  };
}

function exportValue(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return "";
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function exportInventory(count) {
  const XLSX = lib();
  const rows = [OUTPUT_HEADERS, ...count.products.map((product) => [
    product.category,
    product.plu,
    product.description,
    Number(product.onHand),
    product.confirmed === false ? "" : exportValue(product.display),
    product.confirmed === false ? "" : exportValue(product.cupboard),
    product.confirmed === false ? "" : exportValue(product.storeRoom),
  ])];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const border = {
    top: { style: "thin", color: { rgb: "555555" } },
    bottom: { style: "thin", color: { rgb: "555555" } },
    left: { style: "thin", color: { rgb: "555555" } },
    right: { style: "thin", color: { rgb: "555555" } },
  };
  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < OUTPUT_HEADERS.length; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      if (!worksheet[address]) worksheet[address] = { t: "s", v: "" };
      worksheet[address].s = row === 0 ? {
        font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "777777" } },
        border,
        alignment: { vertical: "center", horizontal: "center" },
      } : {
        font: { name: "Arial", sz: 11, bold: true, color: { rgb: "111111" } },
        fill: { patternType: "solid", fgColor: { rgb: row % 2 ? "D9EEF6" : "FFFFFF" } },
        border,
        alignment: { vertical: "center", horizontal: column >= 3 ? "center" : "left" },
        numFmt: column === 1 ? "@" : column >= 3 ? "#,##0.#####" : "General",
      };
    }
  }
  worksheet["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 52 }, { wch: 15 }, { wch: 13 }, { wch: 13 }, { wch: 14 }];
  worksheet["!rows"] = [{ hpt: 24 }, ...Array.from({ length: rows.length - 1 }, () => ({ hpt: 21 }))];
  worksheet["!autofilter"] = { ref: `A1:G${rows.length}` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Store Inventory Journal");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
}

export function exportFileName(count) {
  const base = String(count.fileName || "inventory").replace(/\.xlsx$/i, "").replace(/[^a-z0-9_-]+/gi, "-");
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-counted-${date}.xlsx`;
}

export function downloadWorkbook(count) {
  const bytes = exportInventory(count);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exportFileName(count);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCoordinatorReport(vault) {
  const XLSX = lib(), workbook = XLSX.utils.book_new();
  const asDate = (value) => value ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : "";
  const outcomes = [["Snapshot date", "Source file", "Department", "Category", "PLU", "Description", "Unit", "Season", "Unit cost (AED)", "On Hand", "Provenance", "Physical quantity", "Accepted total", "Variance", "Discrepancy cost (AED)", "Declared quantity", "Resolution", "Resolved", "Private note", "Related records"]];
  const revisions = [["Source file", "PLU", "Date revised", "Previous declared quantity", "New declared quantity", "Reason", "Note"]];
  for (const archive of vault.archives) {
    for (const product of archive.count.products) {
      const totals = productTotals(product), outcome = archive.outcomes[product.id];
      const physical = ["physical-recount", "legacy-count"].includes(product.provenance);
      const cost = typeof product.cost === "number" && product.cost >= 0 && product.unit && totals.complete ? totals.variance * product.cost : "";
      outcomes.push([asDate(archive.count.postingDate), archive.count.fileName, product.department || "Unknown", product.category, product.plu, product.description, product.unit || "Unknown", product.season || "", product.cost ?? "", product.onHand, product.provenance || "Unknown", totals.complete && physical ? totals.countedTotal : "", totals.complete && !physical ? totals.countedTotal : "", totals.variance ?? "", physical ? cost : "", outcome?.declaredQuantity ?? "", outcome?.reason || "", outcome?.resolved ? "Yes" : "No", outcome?.note || "", (outcome?.links || []).map((link) => link.note).join("; ")]);
    }
    for (const revision of archive.revisions) revisions.push([archive.count.fileName, archive.count.products.find((p) => p.id === revision.productId)?.plu || "", asDate(revision.at), revision.previous.declaredQuantity ?? "", revision.outcome.declaredQuantity ?? "", revision.outcome.reason, revision.outcome.note]);
  }
  const batches = [["Department", "PLU", "Description", "Production date", "Off-shelf date", "Date basis", "Quantity observed", "Unit", "Batch", "Location", "Last observed", "Status", "Closure reason"], ...vault.expiryRecords.map((r) => [r.department, r.plu, r.description || "", asDate(r.productionDate), asDate(offShelfDate(r)), r.expiryOverride ? "Printed date" : `${r.shelfLifeMonths ?? 7} calendar months`, r.quantity, r.unit, r.batch || "", r.location || "", asDate(r.observedAt), r.status, r.closureReason || ""])];
  const checks = [["Department", "Completed check date", "Next review date"], ...vault.departmentChecks.map((c) => [c.department, asDate(c.date), asDate(c.nextDate)])];
  for (const [name, rows] of [["Count outcomes", outcomes], ["Outcome revisions", revisions], ["OOD batches", batches], ["Department checks", checks]]) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = rows[0].map((header, column) => ({ wch: Math.min(48, Math.max(16, header.length + 2, ...rows.slice(1).map((row) => row[column] instanceof Date ? 16 : String(row[column] ?? "").length))) }));
    sheet["!rows"] = rows.map((_, index) => ({ hpt: index ? 38 : 28 }));
    sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: rows.length - 1, c: rows[0].length - 1 }) };
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[0].length; c++) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address] ||= { t: "s", v: "" };
      cell.s = { font: { name: "Arial", sz: 11, bold: r === 0, color: { rgb: r === 0 ? "FFFFFF" : "111111" } }, fill: { patternType: "solid", fgColor: { rgb: r === 0 ? "555555" : r % 2 ? "D9EEF6" : "FFFFFF" } }, alignment: { vertical: "center", wrapText: true }, numFmt: rows[r][c] instanceof Date ? "dd mmm yyyy" : cell.t === "n" ? "#,##0.#####" : "@" };
    }
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
}
