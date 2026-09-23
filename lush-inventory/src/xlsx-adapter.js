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
  return globalThis.XLSX;
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
    products.push({
      id: `${plu}::${products.length}`,
      category,
      plu,
      description,
      onHand: toNumber(row[columns.onHand], rowNumber, "On Hand Qty."),
      display: "",
      cupboard: "",
      storeRoom: "",
    });
  });
  if (invalidRows.length) throw new Error(`Rows missing Category, PLU, or Description: ${invalidRows.slice(0, 12).join(", ")}${invalidRows.length > 12 ? "…" : ""}.`);
  if (!products.length) throw new Error("No product rows were found in the worksheet.");
  return {
    schemaVersion: 1,
    fileName,
    sheetName,
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
    exportValue(product.display),
    exportValue(product.cupboard),
    exportValue(product.storeRoom),
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
