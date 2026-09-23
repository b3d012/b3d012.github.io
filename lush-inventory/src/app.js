import { summarizeProducts, productStatus, productTotals, parseCountValue } from "./count-model.js";
import { filterProducts, filterReviewProducts, updateProductField } from "./app-logic.js";
import { importInventory, downloadWorkbook } from "./xlsx-adapter.js";
import { loadActiveCount, saveActiveCount, clearActiveCount, createBackup, restoreBackup } from "./count-store.js";

const root = document.getElementById("app");
const toastNode = document.getElementById("toast");
let activeCount = null;
let pendingCount = null;
let view = "home";
let category = "ALL";
let query = "";
let reviewFilter = "all";
let installPrompt = null;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const formatNumber = (value) => value === null || value === undefined ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 5 }).format(value);
const categories = () => [...new Set((activeCount?.products || []).map((product) => product.category))];

function toast(message) {
  toastNode.textContent = message;
  toastNode.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastNode.classList.remove("show"), 1800);
}

function downloadText(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function topbar() {
  return `<div class="topbar"><div class="brand">Lush Inventory</div><button id="installApp" class="secondary install${installPrompt ? " show" : ""}">Install app</button></div>`;
}

function fileUpload(label = "Upload weekly inventory file", className = "primary") {
  return `<label class="upload ${className}">${escapeHtml(label)}<input id="xlsxUpload" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>`;
}

function renderHome() {
  view = "home";
  if (!activeCount) {
    root.innerHTML = `${topbar()}<section class="card hero"><div class="eyebrow">Weekly stock count</div><h1>Weekly inventory, without the paperwork.</h1><p>Upload the original Excel export. The app prepares the counting list automatically and keeps everything saved on this tablet.</p><div class="actions">${fileUpload()}<label class="upload secondary">Restore backup<input id="backupUpload" type="file" accept="application/json,.json"></label></div></section>`;
  } else {
    const summary = summarizeProducts(activeCount.products);
    root.innerHTML = `${topbar()}<section class="card savedCard"><div class="eyebrow">Current count</div><h1>${escapeHtml(activeCount.fileName)}</h1><p class="productMeta">Imported ${escapeHtml(new Date(activeCount.importedAt).toLocaleString())}</p><div class="savedMeta"><div class="metric">Products<b>${summary.total}</b></div><div class="metric">Completed<b>${summary.complete}</b></div><div class="metric">Progress<b>${summary.percent}%</b></div></div><div class="actions"><button id="continueCount" class="primary">Continue current count</button>${fileUpload("Start new count", "secondary")}<button id="downloadBackup" class="secondary">Download backup</button><label class="upload secondary">Restore backup<input id="backupUpload" type="file" accept="application/json,.json"></label><button id="clearCount" class="danger">Delete current count</button></div></section>`;
  }
  bindCommon();
}

function renderPreview() {
  const preview = pendingCount.products.slice(0, 5);
  const countCategories = new Set(pendingCount.products.map((product) => product.category)).size;
  root.innerHTML = `${topbar()}<section class="card savedCard"><div class="eyebrow">Import preview</div><h1>${escapeHtml(pendingCount.fileName)}</h1><div class="savedMeta"><div class="metric">Products<b>${pendingCount.products.length}</b></div><div class="metric">Categories<b>${countCategories}</b></div><div class="metric">Columns found<b>4/4</b></div></div><div class="notice">Your current saved count will not be replaced until you press Start counting.</div><div class="tableWrap"><table class="previewTable"><thead><tr><th>Category</th><th>PLU</th><th>Description</th><th>On Hand</th></tr></thead><tbody>${preview.map((product) => `<tr><td>${escapeHtml(product.category)}</td><td>${escapeHtml(product.plu)}</td><td>${escapeHtml(product.description)}</td><td>${formatNumber(product.onHand)}</td></tr>`).join("")}</tbody></table></div><div class="actions"><button id="cancelPreview" class="secondary">Cancel</button><button id="confirmImport" class="primary">Start counting</button></div></section>`;
  bindCommon();
  document.getElementById("cancelPreview").onclick = renderHome;
  document.getElementById("confirmImport").onclick = async () => {
    activeCount = pendingCount;
    pendingCount = null;
    await saveActiveCount(activeCount);
    category = "ALL";
    query = "";
    renderCount();
    toast("Count saved on this tablet.");
  };
}

function headerMarkup(summary) {
  return `<div class="shellHeader"><div class="headerLine"><div><div class="eyebrow">${escapeHtml(activeCount.fileName)}</div><h1>Inventory count</h1></div><div class="actions"><button id="home" class="secondary">Home</button><button id="review" class="primary">Review ${summary.complete}/${summary.total}</button></div></div><div class="progressBox"><span>${summary.complete} of ${summary.total} products complete</span><span>${summary.percent}%</span><div class="bar"><span style="width:${summary.percent}%"></span></div></div></div>`;
}

function productMarkup(product) {
  const status = productStatus(product);
  const totals = productTotals(product);
  const inputs = [["display", "Display"], ["cupboard", "Cupboard"], ["storeRoom", "Store Room"]].map(([field, label]) => `<div class="field"><label for="${field}-${escapeHtml(product.id)}">${label}</label><div class="inputWrap"><input id="${field}-${escapeHtml(product.id)}" inputmode="decimal" autocomplete="off" aria-label="${label}" data-field="${field}" value="${escapeHtml(product[field])}"><button class="zero" type="button" data-zero="${field}" aria-label="Set ${label} to zero">0</button></div></div>`).join("");
  return `<article class="product ${status.key}" data-id="${escapeHtml(product.id)}"><div class="productTop"><div><div class="productName">${escapeHtml(product.description)}</div><div class="productMeta">PLU ${escapeHtml(product.plu)} · ${escapeHtml(product.category)}</div></div><div class="onHand"><span class="eyebrow">On Hand</span><b>${formatNumber(product.onHand)}</b></div></div><div class="countGrid">${inputs}<div class="totalBox"><span class="label">Counted / variance</span><div class="totalLine"><span data-total>${totals.complete ? formatNumber(totals.countedTotal) : "—"}</span><span data-variance>${totals.complete ? `${totals.variance > 0 ? "+" : ""}${formatNumber(totals.variance)}` : "—"}</span></div></div></div><div class="statusBadge"><span class="statusDot"></span><span data-status>${status.label}</span></div></article>`;
}

function renderCount() {
  view = "count";
  const summary = summarizeProducts(activeCount.products);
  const filtered = filterProducts(activeCount.products, category, query);
  root.innerHTML = `${headerMarkup(summary)}<div class="tools"><input id="search" class="search" placeholder="Search product or PLU" value="${escapeHtml(query)}"><select id="categorySelect" class="categorySelect" aria-label="Product category"><option value="ALL">All categories</option>${categories().map((item) => `<option value="${escapeHtml(item)}"${item === category ? " selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></div><div class="categoryRail"><button class="chip${category === "ALL" ? " active" : ""}" data-category="ALL">All</button>${categories().map((item) => `<button class="chip${item === category ? " active" : ""}" data-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div><section id="productList" class="productList">${filtered.length ? filtered.map(productMarkup).join("") : '<div class="card empty">No products match this search.</div>'}</section>`;
  bindCount();
}

function refreshProductCard(productId) {
  const product = activeCount.products.find((item) => item.id === productId);
  const card = root.querySelector(`.product[data-id="${CSS.escape(productId)}"]`);
  if (!product || !card) return;
  const status = productStatus(product);
  const totals = productTotals(product);
  card.className = `product ${status.key}`;
  card.querySelector("[data-status]").textContent = status.label;
  card.querySelector("[data-total]").textContent = totals.complete ? formatNumber(totals.countedTotal) : "—";
  card.querySelector("[data-variance]").textContent = totals.complete ? `${totals.variance > 0 ? "+" : ""}${formatNumber(totals.variance)}` : "—";
  const summary = summarizeProducts(activeCount.products);
  const progress = root.querySelector(".progressBox");
  progress.querySelector("span:first-child").textContent = `${summary.complete} of ${summary.total} products complete`;
  progress.querySelector("span:nth-child(2)").textContent = `${summary.percent}%`;
  progress.querySelector(".bar span").style.width = `${summary.percent}%`;
  document.getElementById("review").textContent = `Review ${summary.complete}/${summary.total}`;
}

function bindCount() {
  document.getElementById("home").onclick = renderHome;
  document.getElementById("review").onclick = () => { reviewFilter = "all"; renderReview(); };
  document.getElementById("search").oninput = (event) => { query = event.target.value; renderCount(); document.getElementById("search").focus(); document.getElementById("search").setSelectionRange(query.length, query.length); };
  document.getElementById("categorySelect").onchange = (event) => { category = event.target.value; renderCount(); };
  root.querySelectorAll("[data-category]").forEach((button) => button.onclick = () => { category = button.dataset.category; renderCount(); });
  root.querySelectorAll(".product").forEach((card) => {
    card.querySelectorAll("input[data-field]").forEach((input) => {
      input.oninput = async () => {
        try {
          activeCount.products = updateProductField(activeCount.products, card.dataset.id, input.dataset.field, input.value);
          input.removeAttribute("aria-invalid");
          activeCount.updatedAt = new Date().toISOString();
          refreshProductCard(card.dataset.id);
          await saveActiveCount(activeCount);
          toast("Saved");
        } catch {
          input.setAttribute("aria-invalid", "true");
        }
      };
    });
    card.querySelectorAll("button[data-zero]").forEach((button) => button.onclick = () => {
      const input = card.querySelector(`input[data-field="${button.dataset.zero}"]`);
      input.value = "0";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

function renderReview() {
  view = "review";
  const summary = summarizeProducts(activeCount.products);
  const filtered = filterReviewProducts(activeCount.products, reviewFilter);
  const filters = [["all", "All", summary.total], ["incomplete", "Incomplete", summary.incomplete], ["matching", "Matching", summary.matching], ["under", "Under", summary.under], ["over", "Over", summary.over]];
  root.innerHTML = `${topbar()}<div class="shellHeader"><div class="headerLine"><div><div class="eyebrow">Final check</div><h1>Review inventory</h1></div><div class="actions"><button id="backToCount" class="secondary">Back to count</button><button id="exportExcel" class="primary">Download Excel</button></div></div></div><div class="reviewGrid">${[["Products", summary.total], ["Complete", summary.complete], ["Incomplete", summary.incomplete], ["Matching", summary.matching], ["Under", summary.under], ["Over", summary.over]].map(([label, value]) => `<div class="metric">${label}<b>${value}</b></div>`).join("")}</div><div class="reviewFilters">${filters.map(([key, label, value]) => `<button class="chip${reviewFilter === key ? " active" : ""}" data-review="${key}">${label} ${value}</button>`).join("")}</div><section>${filtered.length ? filtered.map((product) => { const totals = productTotals(product); const status = productStatus(product); return `<button class="reviewRow" data-jump="${escapeHtml(product.id)}"><span class="reviewRowTop"><span>${escapeHtml(product.description)}</span><span>${escapeHtml(status.label)}</span></span><span class="reviewNums">PLU ${escapeHtml(product.plu)} · On Hand ${formatNumber(product.onHand)} · Display ${product.display || "—"} · Cupboard ${product.cupboard || "—"} · Store Room ${product.storeRoom || "—"} · Total ${formatNumber(totals.countedTotal)} · Variance ${formatNumber(totals.variance)}</span></button>`; }).join("") : '<div class="card empty">No products in this filter.</div>'}</section><div class="actions" style="margin-top:14px"><button id="downloadBackup" class="secondary">Download backup</button></div>`;
  bindCommon();
  document.getElementById("backToCount").onclick = renderCount;
  document.getElementById("exportExcel").onclick = () => {
    if (summary.incomplete && !confirm(`${summary.incomplete} products are incomplete. Download the Excel file anyway? Blank fields will stay blank.`)) return;
    downloadWorkbook(activeCount);
    toast("Excel downloaded.");
  };
  root.querySelectorAll("[data-review]").forEach((button) => button.onclick = () => { reviewFilter = button.dataset.review; renderReview(); });
  root.querySelectorAll("[data-jump]").forEach((button) => button.onclick = () => {
    const product = activeCount.products.find((item) => item.id === button.dataset.jump);
    category = product.category;
    query = product.plu;
    renderCount();
  });
}

async function handleXlsx(file) {
  if (!file) return;
  try {
    const bytes = await file.arrayBuffer();
    pendingCount = importInventory(bytes, file.name);
    renderPreview();
  } catch (error) {
    alert(error.message);
    renderHome();
  }
}

async function handleBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (activeCount && !confirm(`Replace ${activeCount.fileName} with the selected backup?`)) return;
    activeCount = await restoreBackup(JSON.stringify(parsed));
    renderHome();
    toast("Backup restored.");
  } catch (error) {
    alert(error.message || "The backup could not be restored.");
  }
}

function bindCommon() {
  const xlsx = document.getElementById("xlsxUpload");
  if (xlsx) xlsx.onchange = (event) => handleXlsx(event.target.files[0]);
  const backup = document.getElementById("backupUpload");
  if (backup) backup.onchange = (event) => handleBackup(event.target.files[0]);
  const install = document.getElementById("installApp");
  if (install) install.onclick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    install.classList.remove("show");
  };
  const continueButton = document.getElementById("continueCount");
  if (continueButton) continueButton.onclick = renderCount;
  const backupButton = document.getElementById("downloadBackup");
  if (backupButton) backupButton.onclick = () => {
    downloadText(createBackup(activeCount), `${activeCount.fileName.replace(/\.xlsx$/i, "")}-backup.json`, "application/json");
    toast("Backup downloaded.");
  };
  const clearButton = document.getElementById("clearCount");
  if (clearButton) clearButton.onclick = async () => {
    if (!confirm(`Delete the saved count for ${activeCount.fileName}? Download a backup first if you need it.`)) return;
    await clearActiveCount();
    activeCount = null;
    renderHome();
  };
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  const install = document.getElementById("installApp");
  if (install) install.classList.add("show");
});

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));

activeCount = await loadActiveCount().catch(() => null);
renderHome();
