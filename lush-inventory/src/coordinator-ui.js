import { unlockVault, saveVault, lockVault, isVaultUnlocked, changePin, loadEnvelope } from "./coordinator-store.js";
import { archiveCount, reviseOutcome, linkDiscrepancies, historySummary, compareSnapshots, RESOLUTIONS, isPhysical } from "./history-model.js";
import { dubaiToday, addDays, expiryStatus, offShelfDate, saveExpiryRecord, recordDepartmentCheck, parseDate } from "./expiry-model.js";
import { productTotals, summarizeProducts } from "./count-model.js";
import { loadActiveCount } from "./count-store.js";
import { createFullBackup, validateFullBackup, replaceFullState } from "./full-backup.js";
import { exportCoordinatorReport } from "./xlsx-adapter.js";

const e = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const n = (value) => typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 5 }).format(value) : "—";
const money = (value) => `AED ${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value)}`;
const date = (value) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Dubai" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : "Unknown";
let root, context, vault, tab = "overview", selectedArchive = null, query = "", department = "ALL", risk = "risk", busy = false, timer, controller, assessmentDate;

function download(content, filename, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const button = (id, text, style = "secondary") => `<button id="${id}" class="${style}" type="button">${text}</button>`;
const input = (name, label, value = "", type = "text", extra = "") => `<label class="coordField">${label}<input name="${name}" type="${type}" value="${e(value)}" ${extra}></label>`;
const departments = () => [...new Set([...(context.getActiveCount()?.products || []).map((p) => p.department || "Unknown department"), ...vault.archives.flatMap((a) => a.count.products.map((p) => p.department || "Unknown department")), ...vault.expiryRecords.map((r) => r.department), ...vault.departmentChecks.map((c) => c.department)])].sort();
const departmentList = () => `<datalist id="departments">${departments().map((d) => `<option value="${e(d)}">`).join("")}</datalist>`;
function touch() { clearTimeout(timer); if (isVaultUnlocked()) timer = setTimeout(lockCoordinator, 300000); }
export function lockCoordinator() { clearTimeout(timer); lockVault(); vault = null; busy = false; if (root) renderLocked(); }
function exit() { clearTimeout(timer); controller?.abort(); lockVault(); vault = null; context.onExit(); root = null; }

export function mountCoordinator(target, callbacks) {
  controller?.abort(); clearTimeout(timer); lockVault();
  root = target; context = callbacks; vault = null; tab = "overview"; selectedArchive = null; query = ""; department = "ALL"; busy = false; assessmentDate = dubaiToday();
  controller = new window.AbortController();
  for (const event of ["pointerdown", "keydown"]) document.addEventListener(event, touch, { signal: controller.signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) lockCoordinator(); }, { signal: controller.signal });
  window.addEventListener("pagehide", lockCoordinator, { signal: controller.signal });
  renderLocked();
}

function renderLocked(message = "") {
  if (!root) return;
  root.innerHTML = `<div class="topbar"><div class="brand">Stock coordinator</div>${button("exitCoordinator", "Back to count")}</div><section class="card pinCard"><div class="lockMark" aria-hidden="true">●</div><div class="eyebrow">Your private records</div><h1>Unlock coordinator</h1><p>History, expiry batches and follow-up notes stay on this tablet.</p><form id="pinForm">${input("pin", "Four-digit PIN", "", "password", 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"')}<p id="pinError" role="alert" class="formError">${e(message)}</p><button class="primary" type="submit">Unlock</button></form><p class="small muted">A four-digit PIN provides casual privacy on this shared tablet. Keep a backup of your records.</p></section>`;
  root.querySelector("#exitCoordinator").onclick = exit;
  root.querySelector("#pinForm").onsubmit = async (event) => {
    event.preventDefault(); if (busy) return; busy = true;
    const pin = event.currentTarget.elements.pin.value;
    event.currentTarget.elements.pin.value = "";
    event.currentTarget.querySelector("button").disabled = true;
    try { const unlocked = await unlockVault(pin); if (!root || !isVaultUnlocked()) return; vault = unlocked; busy = false; touch(); render(); }
    catch (error) { busy = false; if (root) renderLocked(error.message); }
  };
}

function shell(content) {
  root.innerHTML = `<div class="topbar"><div><div class="eyebrow">Private · ${date(dubaiToday())}</div><div class="brand">Stock coordinator</div></div><div class="actions">${button("exitCoordinator", "Back to count")}${button("lockCoordinator", "Lock")}</div></div><nav class="coordNav" aria-label="Coordinator sections">${[["overview", "Overview"], ["history", "History"], ["ood", "OOD tracker"]].map(([key, label]) => `<button class="chip${tab === key ? " active" : ""}" data-tab="${key}">${label}</button>`).join("")}</nav><div id="coordinatorContent">${content}</div><p id="coordinatorError" class="formError" role="alert"></p>`;
  root.querySelector("#exitCoordinator").onclick = exit;
  root.querySelector("#lockCoordinator").onclick = lockCoordinator;
  root.querySelectorAll("[data-tab]").forEach((item) => item.onclick = () => { if (busy) return; tab = item.dataset.tab; selectedArchive = null; query = ""; render(); });
}
async function work(action) {
  if (busy) return;
  busy = true;
  root.querySelectorAll("button").forEach((item) => item.disabled = true);
  try { await action(); }
  catch (error) { if (root) { if (isVaultUnlocked()) root.querySelector("#coordinatorError").textContent = error.message; else { vault = null; renderLocked(error.message); } } }
  finally { busy = false; root?.querySelectorAll("button").forEach((item) => item.disabled = false); }
}
async function persist(candidate, activeCount) { const saved = await saveVault(candidate, activeCount); if (!isVaultUnlocked()) throw new Error("Coordinator locked. Unlock to continue."); vault = saved; }
function render() { if (!root) return; if (!vault || !isVaultUnlocked()) return renderLocked(); touch(); if (tab === "history") renderHistory(); else if (tab === "ood") renderOOD(); else renderOverview(); }

function renderOverview() {
  const summary = historySummary(vault, context.getActiveCount()), today = dubaiToday();
  const batches = vault.expiryRecords.filter((r) => r.status !== "closed");
  const due = batches.filter((r) => ["overdue", "today", "30", "60", "3-months"].includes(expiryStatus(r, today).key));
  const checks = departments().map((d) => ({ department: d, last: [...vault.departmentChecks].filter((c) => c.department === d).sort((a, b) => b.date.localeCompare(a.date))[0] }));
  const active = context.getActiveCount();
  const archived = active && vault.archives.some((a) => a.id === active.id);
  shell(`<section class="coordHeading"><h1>Your stock desk</h1><p>Weekly department checks, with a record of what you found and what happened next.</p></section><div class="coordMetrics">${[["Saved counts", vault.archives.length], ["Pending observations", summary.pending.length], ["Batches due within 3 months", due.length], ["Repeat shortage patterns", summary.repeatShortages.length]].map(([label, value]) => `<div class="metric">${label}<b>${value}</b></div>`).join("")}</div><div class="coordColumns"><section class="card coordPanel"><div class="eyebrow">Current Cycle Count</div><h2>${e(active?.fileName || "Upload a count to get started")}</h2><p>${active ? `${summarizeProducts(active.products).complete}/${active.products.length} confirmed · Snapshot ${date(active.postingDate)}` : "The normal counting screen stays immediately accessible."}</p>${active ? archived ? '<div class="notice success">This count is already archived. Your original observations are preserved.</div>' : button("archiveCurrent", "Archive current count", "primary") : ""}<p class="small muted">Archive before starting another count. MAX entries are labelled accepted from pre-inventory, rather than physically recounted.</p></section><section class="card coordPanel"><div class="eyebrow">Recorded cost exposure</div><h2>${money(summary.shortageValue)} shortage</h2><p>${money(summary.surplusValue)} surplus · ${summary.unknownCost} observations without usable cost/unit data.</p><p class="small muted">Across saved physical count observations. Repeated observations may describe the same unresolved shortage; these totals are not confirmed new losses. Retail sales value is not included.</p></section></div><section class="card coordPanel"><h2>Department checks</h2><p class="muted">Check expiry dates alongside your weekly count rotation. Imports do not complete an OOD inspection.</p>${checks.length ? `<div class="tableWrap"><table class="previewTable"><thead><tr><th>Department</th><th>Last stock snapshot</th><th>Last import</th><th>Last completed count</th><th>Last OOD check</th><th>Next OOD review</th></tr></thead><tbody>${checks.map(({ department: d, last }) => { const snapshot = summary.departments.find((x) => x.department === d); return `<tr><td>${e(d)}</td><td>${date(snapshot?.lastSnapshot)}</td><td>${date(snapshot?.lastImport)}</td><td>${date(snapshot?.lastCount)}</td><td>${last ? date(last.date) : "Not checked"}</td><td>${last ? `${date(last.nextDate)}${last.nextDate <= today ? " · Due" : ""}` : "Set after checking"}</td></tr>`; }).join("")}</tbody></table></div>` : '<p>No department records yet.</p>'}</section>${summary.repeatShortages.length ? `<section class="card coordPanel"><h2>Repeated unexplained shortages</h2>${summary.repeatShortages.map((r) => `<p><strong>${e(r.product.description)}</strong> · ${r.observations} observations · latest ${n(r.latestVariance)} ${e(r.product.unit || "units unknown")}<br><span class="muted small">${r.dates.map(date).join("; ")}</span></p>`).join("")}<p class="small muted">Review counting errors, PLUs, testers and other explanations. A shortage pattern alone does not identify theft.</p></section>` : ""}<section class="card coordPanel"><h2>Backup & settings</h2><div class="actions coordActions">${button("fullBackup", "Download full backup")}${button("reportDownload", "Download coordinator report")}${button("pinChange", "Change PIN")}${button("shelfSettings", "Shelf-life default")}<label class="upload secondary">Restore full backup<input id="fullRestore" type="file" accept="application/json,.json"></label></div><p class="small muted">Full backups preserve encrypted private records. Download one after finishing a count. Reports contain plaintext private notes; store them carefully. Records are local to this browser, without cloud sync.</p></section>`);
  root.querySelector("#archiveCurrent")?.addEventListener("click", () => archiveActive());
  root.querySelector("#fullBackup").onclick = () => work(async () => { download(createFullBackup(await loadActiveCount(), await loadEnvelope()), `lush-stock-backup-${today}.json`); context.toast("Full backup downloaded."); });
  root.querySelector("#reportDownload").onclick = () => work(async () => {
    if (!window.confirm("This report includes private notes as readable Excel data. Download it?")) return;
    download(exportCoordinatorReport(vault), `lush-stock-report-${today}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
  root.querySelector("#pinChange").onclick = renderPinChange;
  root.querySelector("#shelfSettings").onclick = renderShelfSettings;
  root.querySelector("#fullRestore").onchange = (event) => restoreFull(event.target.files[0]);
}
function archiveActive(snapshotDate) {
  const active = context.getActiveCount(); if (!active) return;
  if (!snapshotDate && !active.postingDate) {
    shell(`<section class="card coordPanel"><h1>Confirm snapshot date</h1><p>The source file does not have one unambiguous posting date.</p><form id="archiveDate">${input("date", "Source snapshot date", dubaiToday(), "date", "required")}<button class="primary">Archive count</button></form></section>`);
    root.querySelector("#archiveDate").onsubmit = (event) => { event.preventDefault(); archiveActive(event.currentTarget.elements.date.value); }; return;
  }
  work(async () => {
    const count = structuredClone(active); count.postingDate = snapshotDate || count.postingDate; parseDate(count.postingDate);
    if (count.postingDate > dubaiToday()) throw new Error("Snapshot date cannot be in the future.");
    const incomplete = summarizeProducts(count.products).incomplete;
    if (incomplete && !window.confirm(`${incomplete} products are incomplete. Save this partial record? They will be excluded from discrepancy totals.`)) return;
    const marked = { ...count, archivedAt: new Date().toISOString() };
    await persist(archiveCount(vault, count, marked.archivedAt), marked);
    await context.saveActiveCount(marked);
    context.onArchived?.(count.id);
    tab = "history"; selectedArchive = count.id; render(); context.toast("Archived. Download a full backup to keep these records safe.");
  });
}

function renderHistory() {
  if (selectedArchive) return renderArchive(vault.archives.find((a) => a.id === selectedArchive));
  const needle = query.toLowerCase().trim();
  const archives = [...vault.archives].reverse().filter((a) => a.count.products.some((p) => (department === "ALL" || (p.department || "Unknown department") === department) && (!needle || `${p.description} ${p.plu} ${p.category} ${a.count.fileName}`.toLowerCase().includes(needle))));
  shell(`<section class="coordHeading"><h1>Count history</h1><p>Original observations stay intact. Final declarations and follow-ups are recorded separately.</p></section><div class="tools"><input id="historySearch" class="search" value="${e(query)}" placeholder="Search history by product or PLU"><select id="historyDepartment" class="categorySelect" aria-label="History department"><option value="ALL">All departments</option>${departments().map((d) => `<option${department === d ? " selected" : ""}>${e(d)}</option>`).join("")}</select></div>${archives.length ? archives.map((a) => `<button class="reviewRow" data-archive="${e(a.id)}"><span class="reviewRowTop"><span>${e(a.count.fileName)}</span><span>${date(a.count.postingDate)}</span></span><span class="reviewNums">${[...new Set(a.count.products.map((p) => p.department || "Unknown department"))].map(e).join(", ")} · ${summarizeProducts(a.count.products).complete}/${a.count.products.length} confirmed${a.count.supersedesId ? " · Linked amendment" : ""} · archived ${date(a.archivedAt)}</span></button>`).join("") : '<section class="card empty">No saved counts match. Archive a Cycle Count from Overview to start your history.</section>'}`);
  root.querySelector("#historySearch").oninput = (event) => { query = event.target.value; renderHistory(); const field = root.querySelector("#historySearch"); field.focus(); field.setSelectionRange(query.length, query.length); };
  root.querySelector("#historyDepartment").onchange = (event) => { department = event.target.value; renderHistory(); };
  root.querySelectorAll("[data-archive]").forEach((b) => b.onclick = () => { selectedArchive = b.dataset.archive; renderHistory(); });
}
function renderArchive(archive) {
  if (!archive) { selectedArchive = null; return renderHistory(); }
  const rows = archive.count.products.filter((p) => (department === "ALL" || (p.department || "Unknown department") === department) && (!query.trim() || `${p.description} ${p.plu} ${p.category}`.toLowerCase().includes(query.trim().toLowerCase())));
  const preceding = [...vault.archives].filter((a) => a.count.postingDate && a.count.postingDate < archive.count.postingDate).sort((a, b) => b.count.postingDate.localeCompare(a.count.postingDate));
  shell(`<section class="coordHeading"><div class="headerLine"><div><div class="eyebrow">Snapshot ${date(archive.count.postingDate)}</div><h1>${e(archive.count.fileName)}</h1></div>${button("allHistory", "All history")}</div></section><input id="archiveSearch" class="search coordSearch" placeholder="Find product, category or PLU" value="${e(query)}"><p class="small muted">Observed quantities and source values below cannot be overwritten. Open a product to add a declared quantity, explanation or follow-up.</p>${rows.map((p) => {
    const total = productTotals(p), outcome = archive.outcomes[p.id];
    const previous = preceding.find((a) => a.count.products.some((x) => x.plu === p.plu && x.department === p.department));
    const comparison = previous ? compareSnapshots(previous.count, archive.count).find((x) => x.product.id === p.id) : null;
    return `<button class="reviewRow" data-outcome="${e(p.id)}"><span class="reviewRowTop"><span>${e(p.description)}</span><span>${total.complete ? `${total.variance > 0 ? "+" : ""}${n(total.variance)} ${e(p.unit || "")}` : "Not confirmed"}</span></span><span class="reviewNums">PLU ${e(p.plu)} · ${e(p.department || "Unknown department")} · On Hand ${n(p.onHand)} · ${isPhysical(p) ? "Physical" : "Accepted"} ${n(total.countedTotal)}<br>${p.provenance === "carried-forward" ? "Accepted from pre-inventory" : e(p.provenance || "Unknown origin")} · Declared ${n(outcome?.declaredQuantity)}${outcome ? ` · ${e(RESOLUTIONS.find(([key]) => key === outcome.reason)?.[1] || outcome.reason)}${outcome.resolved ? " · Resolved" : " · Follow-up"}` : ""}<br>On Hand change ${comparison ? `${n(comparison.change)} (${date(comparison.from)} to ${date(comparison.to)})${comparison.warning ? ` · ${e(comparison.warning)}` : ""}` : "— · no comparable earlier snapshot"}${p.season ? `<br>Season: ${e(p.season)}${outcome?.seasonalReview ? " · Flagged for review" : ""}` : ""}</span></button>`;
  }).join("") || '<section class="card empty">No matching products.</section>'}`);
  root.querySelector("#allHistory").onclick = () => { selectedArchive = null; query = ""; renderHistory(); };
  root.querySelector("#archiveSearch").oninput = (event) => { query = event.target.value; renderArchive(archive); const field = root.querySelector("#archiveSearch"); field.focus(); field.setSelectionRange(query.length, query.length); };
  root.querySelectorAll("[data-outcome]").forEach((b) => b.onclick = () => renderOutcome(archive, b.dataset.outcome));
}
function renderOutcome(archive, id) {
  const product = archive.count.products.find((p) => p.id === id), total = productTotals(product);
  const outcome = archive.outcomes[id] || { declaredQuantity: null, reason: "unresolved", note: "", resolved: false, seasonalReview: false };
  const targets = vault.archives.flatMap((a) => a.count.products.filter((p) => p.id !== id || a.id !== archive.id).filter((p) => productTotals(p).complete && productTotals(p).variance).map((p) => ({ archiveId: a.id, productId: p.id, label: `${p.description} · ${n(productTotals(p).variance)} · ${a.count.postingDate || a.archivedAt.slice(0, 10)}` })));
  shell(`<section class="card coordPanel"><div class="headerLine"><h1>${e(product.description)}</h1>${button("backArchive", "Back")}</div><p>PLU ${e(product.plu)} · On Hand ${n(product.onHand)} · ${isPhysical(product) ? "Physical count" : "Accepted total"} ${n(total.countedTotal)} · Variance ${n(total.variance)} ${e(product.unit || "")}</p>${!total.complete ? '<div class="notice">This row was incomplete and is excluded from discrepancy totals.</div>' : ""}<form id="outcomeForm" class="coordForm">${input("declaredQuantity", "Final quantity declared (optional)", outcome.declaredQuantity ?? "", "text", 'inputmode="decimal"')}<label class="coordField">Explanation<select name="reason">${RESOLUTIONS.map(([key, label]) => `<option value="${key}"${outcome.reason === key ? " selected" : ""}>${label}</option>`).join("")}</select></label><label class="coordField wide">Private note / reference<textarea name="note" rows="3">${e(outcome.note)}</textarea></label><label class="checkField"><input name="resolved" type="checkbox"${outcome.resolved ? " checked" : ""}> Follow-up completed / explanation confirmed</label><label class="checkField"><input name="seasonalReview" type="checkbox"${outcome.seasonalReview ? " checked" : ""}> Seasonal stock needs review</label><p class="small muted wide">Pending testers and unresolved or retained-surplus records stay open. Confirm tester wastage only after you know it was processed. A declared value does not alter the original count.</p><button class="primary wide">Save follow-up</button></form></section><section class="card coordPanel"><h2>Related discrepancy</h2><p>Link a suspected wrong punch or PLU mismatch while keeping both observations visible.</p><form id="linkForm" class="coordForm"><label class="coordField wide">Related product<select name="target" required><option value="">Choose a discrepancy</option>${targets.map((ref, i) => `<option value="${i}">${e(ref.label)}</option>`).join("")}</select></label>${input("note", "Why these records are related", "", "text", "required")}<button class="secondary">Link records</button></form>${(outcome.links || []).map((link) => `<p class="small">${date(link.at)} · ${e(link.note)}</p>`).join("")}</section><section class="card coordPanel"><h2>Revision history</h2>${archive.revisions.filter((r) => r.productId === id).map((r) => `<p class="small">${date(r.at)} · Declared ${n(r.previous.declaredQuantity)} → ${n(r.outcome.declaredQuantity)} · ${e(r.outcome.reason)} · ${e(r.outcome.note)}</p>`).join("") || '<p class="muted">No follow-up edits yet.</p>'}</section>`);
  root.querySelector("#backArchive").onclick = () => renderArchive(archive);
  root.querySelector("#outcomeForm").onsubmit = (event) => { event.preventDefault(); const form = event.currentTarget; const raw = form.elements.declaredQuantity.value.trim(); work(async () => { if (raw && !/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw)) throw new Error("Enter a valid declared quantity or leave it blank."); await persist(reviseOutcome(vault, archive.id, id, { declaredQuantity: raw ? Number(raw) : null, reason: form.elements.reason.value, note: form.elements.note.value, resolved: form.elements.resolved.checked, seasonalReview: form.elements.seasonalReview.checked })); renderOutcome(vault.archives.find((a) => a.id === archive.id), id); context.toast("Follow-up saved."); }); };
  root.querySelector("#linkForm").onsubmit = (event) => { event.preventDefault(); const form = event.currentTarget; const target = targets[Number(form.elements.target.value)]; work(async () => { if (!target) throw new Error("Choose a related discrepancy."); await persist(linkDiscrepancies(vault, [{ archiveId: archive.id, productId: id }, target], form.elements.note.value)); renderOutcome(vault.archives.find((a) => a.id === archive.id), id); context.toast("Records linked. Counts remain unchanged."); }); };
}

function renderOOD() {
  const today = assessmentDate || dubaiToday();
  const records = vault.expiryRecords.filter((r) => (department === "ALL" || r.department === department) && (!query.trim() || `${r.plu} ${r.description} ${r.batch || ""}`.toLowerCase().includes(query.trim().toLowerCase()))).filter((r) => { const key = expiryStatus(r, today).key; return risk === "all" || (risk === "risk" ? ["overdue", "today", "30", "60", "3-months"].includes(key) : key === risk); }).sort((a, b) => offShelfDate(a).localeCompare(offShelfDate(b)));
  shell(`<section class="coordHeading"><div class="headerLine"><div><h1>OOD tracker</h1><p>Production date + ${vault.settings?.shelfLifeMonths ?? 7} calendar months by default. Track each batch separately.</p></div><div class="actions">${button("newBatch", "Add batch", "primary")}${button("recordCheck", "Record department check")}</div></div></section><label class="coordField">Check date<input id="oodCheckDate" type="date" value="${e(today)}"></label><div class="tools"><input id="oodSearch" class="search" placeholder="Find expiry batch or PLU" value="${e(query)}"><select id="oodDepartment" class="categorySelect" aria-label="OOD department"><option value="ALL">All departments</option>${departments().map((d) => `<option${department === d ? " selected" : ""}>${e(d)}</option>`).join("")}</select></div><div class="categoryRail">${[["risk", "Next 3 months + overdue"], ["overdue", "Overdue"], ["today", "Off shelf today"], ["30", "Within 30 days"], ["60", "31–60 days"], ["3-months", "Later within 3 months"], ["all", "All batches"], ["closed", "Closed"]].map(([key, label]) => `<button class="chip${risk === key ? " active" : ""}" data-risk="${key}">${label}</button>`).join("")}</div><p class="small muted">Quantities are observations, not live stock balances. Update or close batches after verifying what happened; stock-file changes do not automatically deduct them.</p>${records.length ? records.map((r) => { const status = expiryStatus(r, today); return `<article class="card batchCard ${status.key === "overdue" || status.key === "today" ? "urgent" : ""}"><div class="headerLine"><div><span class="badge">${e(status.label)}</span><h2>${e(r.description || r.plu)}</h2><p class="small muted">PLU ${e(r.plu)} · ${e(r.department)}${r.batch ? ` · Batch ${e(r.batch)}` : ""}${r.location ? ` · ${e(r.location)}` : ""}</p></div><div class="batchDue"><span>Off shelf</span><strong>${date(status.due)}</strong><span>${n(r.quantity)} ${e(r.unit)}</span></div></div><p class="small">Produced ${date(r.productionDate)} · ${r.expiryOverride ? "Explicit expiry / off-shelf date" : `${r.shelfLifeMonths ?? 7}-month rule`} · Last observed ${date(r.observedAt)}${r.status === "closed" ? ` · ${e(r.closureReason)}` : ""}</p><div class="actions coordActions"><button class="secondary" data-edit-batch="${e(r.id)}">Edit / history</button>${r.status !== "closed" ? `<button class="secondary" data-close-batch="${e(r.id)}">Close batch</button>` : ""}</div></article>`; }).join("") : '<section class="card empty">No batches in this view. Record products during the physical expiry check, or choose All batches.</section>'}`);
  root.querySelector("#oodCheckDate").onchange = (event) => { try { parseDate(event.target.value); assessmentDate = event.target.value; renderOOD(); } catch (error) { root.querySelector("#coordinatorError").textContent = error.message; } };
  root.querySelector("#newBatch").onclick = () => renderBatch();
  root.querySelector("#recordCheck").onclick = renderCheck;
  root.querySelector("#oodDepartment").onchange = (event) => { department = event.target.value; renderOOD(); };
  root.querySelector("#oodSearch").oninput = (event) => { query = event.target.value; renderOOD(); const field = root.querySelector("#oodSearch"); field.focus(); field.setSelectionRange(query.length, query.length); };
  root.querySelectorAll("[data-risk]").forEach((b) => b.onclick = () => { risk = b.dataset.risk; renderOOD(); });
  root.querySelectorAll("[data-edit-batch]").forEach((b) => b.onclick = () => renderBatch(vault.expiryRecords.find((r) => r.id === b.dataset.editBatch)));
  root.querySelectorAll("[data-close-batch]").forEach((b) => b.onclick = () => renderClose(vault.expiryRecords.find((r) => r.id === b.dataset.closeBatch)));
}
function renderBatch(record = {}) {
  const available = new Map();
  for (const p of [...(context.getActiveCount()?.products || []), ...[...vault.archives].reverse().flatMap((a) => a.count.products)]) {
    const matches = available.get(p.plu) || [];
    if (!matches.some((x) => x.department === p.department && x.unit === p.unit)) matches.push(p);
    available.set(p.plu, matches);
  }
  shell(`<section class="card coordPanel"><div class="headerLine"><h1>${record.id ? "Edit batch" : "Record a production batch"}</h1>${button("backOOD", "Back")}</div><form id="batchForm" class="coordForm">${input("plu", "PLU", record.plu || "", "text", 'required list="knownProducts"')}${input("description", "Product name", record.description || "")}${input("department", "Department", record.department || (department === "ALL" ? "" : department), "text", 'required list="departments"')}${input("productionDate", "Production date", record.productionDate || "", "date", `required max="${dubaiToday()}"`)}${input("quantity", "Quantity in this batch", record.quantity ?? "", "number", 'required min="0.00001" step="any"')}${input("unit", "Unit (PCS, KG…)", record.unit || "", "text", "required")}${input("expiryOverride", "Printed expiry / off-shelf date (optional)", record.expiryOverride || "", "date")}${input("location", "Location (optional)", record.location || "")}${input("batch", "Batch identifier (optional)", record.batch || "")}<p id="productIdentityWarning" class="notice wide" role="status">Choose a PLU; confirm the department and unit for this physical batch.</p><p id="expiryPreview" class="notice wide">Default shelf life: ${record.shelfLifeMonths ?? vault.settings?.shelfLifeMonths ?? 7} calendar months. A printed date overrides it.</p><button class="primary wide">Save batch</button></form>${departmentList()}<datalist id="knownProducts">${[...available.values()].flat().map((p) => `<option value="${e(p.plu)}">${e(p.description)}</option>`).join("")}</datalist>${record.id ? `<h2>Batch history</h2>${record.events.map((event) => `<p class="small">${date(event.at)} · ${e(event.action)} · quantity ${n(event.values?.quantity)} · ${e(event.values?.status || "active")}</p>`).join("")}` : ""}</section>`);
  root.querySelector("#backOOD").onclick = renderOOD;
  const form = root.querySelector("#batchForm");
  form.elements.plu.onchange = () => {
    const matches = available.get(form.elements.plu.value.trim()) || [];
    const p = matches.length === 1 ? matches[0] : null;
    form.elements.description.value = p?.description || ""; form.elements.department.value = p?.department || ""; form.elements.unit.value = p?.unit || "";
    root.querySelector("#productIdentityWarning").textContent = matches.length > 1 ? `Multiple conflicting identities: ${matches.map((x) => `${x.department || "Unknown department"} / ${x.unit || "Unknown unit"}`).join("; ")}. Choose the department and unit manually for this batch.` : "Confirm the department and unit for this physical batch.";
  };
  const preview = () => { try { root.querySelector("#expiryPreview").textContent = `Off shelf ${date(offShelfDate({ productionDate: form.elements.productionDate.value, expiryOverride: form.elements.expiryOverride.value || null, shelfLifeMonths: record.shelfLifeMonths ?? vault.settings?.shelfLifeMonths ?? 7 }))}`; } catch { root.querySelector("#expiryPreview").textContent = "Enter a valid production date to calculate the off-shelf date."; } };
  form.elements.productionDate.onchange = preview; form.elements.expiryOverride.onchange = preview;
  form.onsubmit = (event) => { event.preventDefault(); const fields = Object.fromEntries(new FormData(form).entries()); work(async () => { await persist(saveExpiryRecord(vault, { ...record, ...fields, plu: fields.plu.trim(), department: fields.department.trim(), quantity: Number(fields.quantity), unit: fields.unit.trim().toUpperCase(), expiryOverride: fields.expiryOverride || null, shelfLifeMonths: record.shelfLifeMonths ?? vault.settings?.shelfLifeMonths ?? 7 })); risk = "all"; query = ""; department = "ALL"; renderOOD(); context.toast("Batch saved."); }); };
}
function renderClose(record) {
  shell(`<section class="card coordPanel"><h1>Close ${e(record.description || record.plu)}</h1><p>Keep the original batch and record why it is no longer being monitored.</p><form id="closeBatch" class="coordForm"><label class="coordField">Outcome<select name="reason"><option>Sold</option><option>Wasted</option><option>Transferred</option><option>Corrected</option><option>Other</option></select></label>${input("reference", "Note / reference (optional)")}<button class="primary">Close batch</button>${button("cancelClose", "Cancel")}</form></section>`);
  root.querySelector("#cancelClose").onclick = renderOOD;
  root.querySelector("#closeBatch").onsubmit = (event) => { event.preventDefault(); const form = event.currentTarget; work(async () => { await persist(saveExpiryRecord(vault, { ...record, status: "closed", closureReason: `${form.elements.reason.value}${form.elements.reference.value ? `: ${form.elements.reference.value}` : ""}` })); risk = "closed"; renderOOD(); context.toast("Batch closed; history retained."); }); };
}
function renderCheck() {
  shell(`<section class="card coordPanel"><h1>Record a completed OOD check</h1><p>Use this after physically checking the department, including when no at-risk stock was found.</p><form id="checkForm" class="coordForm">${input("department", "Department checked", department === "ALL" ? "" : department, "text", 'required list="departments"')}${input("date", "Date checked", dubaiToday(), "date", `required max="${dubaiToday()}"`)}${input("nextDate", "Next review date", addDays(dubaiToday(), 7), "date", "required")}<button class="primary">Save completed check</button>${button("cancelCheck", "Cancel")}</form>${departmentList()}</section>`);
  root.querySelector("#cancelCheck").onclick = renderOOD;
  root.querySelector("#checkForm").onsubmit = (event) => { event.preventDefault(); const form = event.currentTarget; work(async () => { await persist(recordDepartmentCheck(vault, form.elements.department.value, form.elements.date.value, form.elements.nextDate.value)); tab = "overview"; render(); context.toast("Department check saved."); }); };
}
function renderPinChange() {
  shell(`<section class="card coordPanel"><h1>Change coordinator PIN</h1><form id="changePinForm" class="coordForm">${input("old", "Current PIN", "", "password", 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"')}${input("next", "New four-digit PIN", "", "password", 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"')}${input("repeat", "Repeat new PIN", "", "password", 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"')}<button class="primary">Change PIN</button>${button("cancelSettings", "Cancel")}</form><p class="small muted">Your records will be re-encrypted. Existing backups continue to use the PIN they were created with.</p></section>`);
  root.querySelector("#cancelSettings").onclick = render;
  root.querySelector("#changePinForm").onsubmit = (event) => { event.preventDefault(); const form = event.currentTarget; const old = form.elements.old.value, next = form.elements.next.value, repeat = form.elements.repeat.value; form.reset(); work(async () => { if (next !== repeat) throw new Error("New PINs do not match."); vault = await changePin(old, next); render(); context.toast("PIN changed. Download a new backup."); }); };
}
function renderShelfSettings() {
  shell(`<section class="card coordPanel"><h1>Default off-shelf age</h1><p>This applies to new batch records. Existing batches retain their original rule or printed-date override.</p><form id="shelfForm">${input("months", "Calendar months from production", vault.settings?.shelfLifeMonths ?? 7, "number", 'required min="1" max="120" step="1"')}<div class="actions coordActions"><button class="primary">Save default</button>${button("cancelSettings", "Cancel")}</div></form></section>`);
  root.querySelector("#cancelSettings").onclick = render;
  root.querySelector("#shelfForm").onsubmit = (event) => { event.preventDefault(); const months = Number(event.currentTarget.elements.months.value); work(async () => { if (!Number.isInteger(months) || months < 1 || months > 120) throw new Error("Choose a whole number of months from 1 to 120."); await persist({ ...vault, settings: { ...vault.settings, shelfLifeMonths: months } }); render(); context.toast("Default updated for new batches."); }); };
}
async function restoreFull(file) {
  if (!file) return;
  shell(`<section class="card coordPanel"><h1>Restore full backup</h1><p>Validation happens before anything is replaced. Enter the PIN used when this backup was created.</p><form id="restoreForm">${input("pin", "Backup PIN", "", "password", 'inputmode="numeric" pattern="[0-9]{4}" required maxlength="4" autocomplete="off"')}<div class="actions coordActions"><button class="primary">Validate backup</button>${button("cancelRestore", "Cancel")}</div></form></section>`);
  root.querySelector("#cancelRestore").onclick = render;
  root.querySelector("#restoreForm").onsubmit = (event) => { event.preventDefault(); const pin = event.currentTarget.elements.pin.value; event.currentTarget.reset(); work(async () => { const verified = await validateFullBackup(await file.text(), pin); if (!window.confirm("Download a backup of current data before replacing it?")) return; download(createFullBackup(await loadActiveCount(), await loadEnvelope()), `lush-before-restore-${dubaiToday()}.json`); if (!window.confirm("Replace the current count and all coordinator records with this validated backup?")) return; await replaceFullState(verified); await context.onRestored?.(); lockCoordinator(); context.toast("Full backup restored. Unlock using its PIN."); }); };
}
