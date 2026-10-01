const iso = (date) => date.toISOString().slice(0, 10);
export function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid date.");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || iso(date) !== value) throw new Error("Enter a valid calendar date.");
  return date;
}
export function dubaiToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const part = (key) => parts.find((item) => item.type === key).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function addMonths(value, months) {
  const date = parseDate(value);
  if (!Number.isInteger(months) || months < 0 || months > 120) throw new Error("Shelf life must be a whole number of months, up to 120.");
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return iso(date);
}
export function addDays(value, days) { const date = parseDate(value); date.setUTCDate(date.getUTCDate() + days); return iso(date); }
export function offShelfDate(record) {
  if (record.expiryOverride) { parseDate(record.expiryOverride); return record.expiryOverride; }
  return addMonths(record.productionDate, record.shelfLifeMonths ?? 7);
}
export function expiryStatus(record, checkDate = dubaiToday()) {
  parseDate(checkDate);
  const due = offShelfDate(record);
  const days = Math.round((parseDate(due) - parseDate(checkDate)) / 86400000);
  if (record.status === "closed") return { key: "closed", label: "Closed", due, days };
  const key = due < checkDate ? "overdue" : due === checkDate ? "today" : days <= 30 ? "30" : days <= 60 ? "60" : due <= addMonths(checkDate, 3) ? "3-months" : "later";
  const label = { overdue: "Overdue", today: "Off shelf today", "30": "Within 30 days", "60": "Within 60 days", "3-months": "Within 3 months", later: "Later" }[key];
  return { key, label, due, days };
}
export function saveExpiryRecord(vault, record, now = new Date().toISOString()) {
  parseDate(record.productionDate);
  if (record.productionDate > dubaiToday(now)) throw new Error("Production date cannot be in the future.");
  if (!String(record.plu || "").trim() || !String(record.department || "").trim() || !String(record.unit || "").trim() || !Number.isFinite(record.quantity) || record.quantity <= 0) throw new Error("Enter a product, department, unit and quantity greater than zero.");
  if (offShelfDate(record) < record.productionDate) throw new Error("Off-shelf date cannot precede production date.");
  if (record.status === "closed" && !String(record.closureReason || "").trim()) throw new Error("Enter a reason for closing this batch.");
  const next = structuredClone(vault);
  const id = record.id || crypto.randomUUID();
  const index = next.expiryRecords.findIndex((entry) => entry.id === id);
  const previous = index < 0 ? null : next.expiryRecords[index];
  const { events: ignored, ...values } = record;
  const saved = { ...values, id, status: record.status || "active", shelfLifeMonths: record.shelfLifeMonths ?? 7, observedAt: now, events: [...(previous?.events || []), { at: now, action: previous ? "Update batch" : "Record batch", previous: previous ? { quantity: previous.quantity, productionDate: previous.productionDate, expiryOverride: previous.expiryOverride, status: previous.status } : null, values: structuredClone(values) }] };
  if (index < 0) next.expiryRecords.push(saved); else next.expiryRecords[index] = saved;
  return next;
}
export function recordDepartmentCheck(vault, department, date, nextDate, now = new Date().toISOString()) {
  parseDate(date); parseDate(nextDate);
  if (!String(department).trim() || date > dubaiToday(now) || nextDate < date) throw new Error("Choose a department, a completed check date and a later review date.");
  const next = structuredClone(vault);
  next.departmentChecks.push({ id: crypto.randomUUID(), department: String(department).trim(), date, nextDate, recordedAt: now });
  return next;
}
