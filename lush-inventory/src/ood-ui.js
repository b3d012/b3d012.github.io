import { addMonths, dubaiToday, parseDate } from "./expiry-model.js";
import { archiveOODCount, createOODCount, OOD_BUCKETS, oodBucketValue, oodTotals, oodWindows, updateOODRow } from "./ood-count.js";
import { exportOODCount, importInventory } from "./xlsx-adapter.js";
import { countAreas, countTitle, namedWorkbook } from "./count-naming.js";

const states = { "not-started": "Not started", "in-progress": "Incomplete", invalid: "Check quantities", matching: "Matches", under: "Shortage", over: "Extra stock" };

export function renderOODCounts(api, page = "entry", archiveId) {
  const { root, shell, e, n, date, button, getVault, work, persist, autosave, download, toast, showBatches } = api;
  const show = (next, id) => renderOODCounts(api, next, id);
  const nav = `<div class="actions coordActions oodNav">${button("oodEntry", "OOD Count", page === "entry" ? "primary" : "secondary")}${button("oodHistory", "OOD Count History", page === "history" || page === "archive" ? "primary" : "secondary")}${button("batchRecords", "Batch records")}</div>`;
  const screen = (html) => {
    shell(nav + html);
    root.querySelector("#oodEntry").onclick = () => show("entry");
    root.querySelector("#oodHistory").onclick = () => show("history");
    root.querySelector("#batchRecords").onclick = showBatches;
  };
  const counts = getVault().oodCounts || [];
  if (page === "history") {
    screen(`<section class="coordHeading"><h1>OOD Count History</h1><p>Open a saved count to check the original On Hand, expiry quantities and variance, or download it again.</p></section>${counts.length ? counts.map((c, i) => `<button class="reviewRow" data-ood-archive="${i}"><span class="reviewRowTop"><span>${e(countTitle(c))}</span><span>${date(c.checkedOn)}</span></span><span class="reviewNums">${e([...new Set(c.products.map((p) => p.department || p.category))].join(", "))} · ${c.products.filter((p) => oodTotals(p).complete).length}/${c.products.length} confirmed · Saved ${date(c.archivedAt)}</span></button>`).join("") : '<section class="card empty">No saved OOD counts yet.</section>'}`);
    root.querySelectorAll("[data-ood-archive]").forEach((b) => b.onclick = () => show("archive", counts[Number(b.dataset.oodArchive)].id));
    return;
  }

  const draft = getVault().oodDraft;
  const saved = page === "archive";
  const editing = page === "entry";
  const count = saved ? counts.find((c) => c.id === archiveId) : draft && { ...draft, countMode: "ood" };
  const uploader = `<label class="upload ${draft ? "secondary" : "primary"}">${draft ? "Upload another stock file" : "Upload stock Excel"}<input id="oodUpload" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>`;
  if (!count) {
    screen(`<section class="card coordPanel"><div class="eyebrow">Expiry stocktake</div><h1>OOD Count</h1><p>Use the same Excel stock file as Cycle Count. Enter the stock you actually find in each expiry window, then review any extra or missing quantities.</p><div class="actions coordActions">${uploader}</div></section>`);
    setupUpload();
    return;
  }

  const [today, first, second, third] = oodWindows(count.checkedOn);
  const details = `<details class="oodGuide"><summary>Expiry windows and date guide</summary><p>Use the printed off-shelf date when available. Otherwise use production date + ${count.shelfLifeMonths} calendar months. Count each item once.</p><dl>${OOD_BUCKETS.map(([, label], i) => `<dt>${label}</dt><dd>${[
    `Through ${date(today)}, including today`, `After ${date(today)} through ${date(first)}`, `After ${date(first)} through ${date(second)}`,
    `After ${date(second)} through ${date(third)}`, `After ${date(third)}`,
  ][i]}</dd>`).join("")}</dl></details>`;
  const categories = [...new Set(count.products.map((p) => p.category))].sort();
  screen(`<section class="coordHeading"><div class="headerLine"><div><div class="eyebrow">${saved ? "Saved OOD count" : editing ? "Expiry stocktake" : "Final check"}</div><h1>${editing ? "OOD Count" : saved ? "Saved OOD Count" : "Review OOD Count"}</h1><p><span id="oodCountTitle">${e(countTitle(count))}</span> · ${count.products.length} products · Checked ${date(count.checkedOn)}</p>${count.countMode ? `<p class="small muted">Source: ${e(count.fileName)}</p>` : ""}</div><div class="actions coordActions">${editing ? button("reviewOOD", "Review count", "primary") + uploader : (saved ? button("backOODHistory", "Back to history") : button("editOOD", "Back to count")) + button("exportOOD", "Download Excel", "primary") + (saved ? "" : button("archiveOOD", "Save to OOD History", "primary"))}</div></div></section>
    ${editing ? `<label class="coordField oodDate">Check date<input id="oodCountDate" type="date" max="${dubaiToday()}" value="${e(count.checkedOn)}"></label><label class="coordField">Areas<input id="oodAreas" maxlength="200" value="${e(count.areaLabel || "")}" placeholder="${e(countAreas(count))}"></label>` : ""}
    ${details}
    ${count.warnings.length ? `<details class="notice"><summary>Stock file notes (${count.warnings.length})</summary><ul>${count.warnings.map((w) => `<li>${e(w)}</li>`).join("")}</ul></details>` : ""}
    <p class="small muted">${editing ? "Enter the actual quantity in each bucket. The first four buckets start at zero. Fill in More than 3 Months, even if it is zero. Use Confirm zero when no units are found." : "Excel variance = On Hand minus Counted (positive is a shortage). The screen shows Counted minus On Hand, like Cycle Count."}</p>
    <div class="oodProgress" id="oodProgress"></div><p id="oodSaveStatus" class="small muted" role="status"></p>
    <div class="tools oodTools"><input id="oodCountSearch" class="search" aria-label="Search product or PLU" placeholder="Search product or PLU"><select id="oodCountCategory" class="categorySelect" aria-label="Product category"><option value="">All categories</option>${categories.map((c) => `<option>${e(c)}</option>`).join("")}</select><select id="oodCountFilter" class="categorySelect" aria-label="Count status"><option value="">All statuses</option><option value="unfinished">Unfinished</option><option value="under">Shortage</option><option value="over">Extra stock</option><option value="matching">Matches</option><option value="risk">OOD or due within 3 months</option></select></div>
    <section class="productList" id="oodProducts"></section>`);

  const current = () => saved ? count : getVault().oodDraft;
  const list = root.querySelector("#oodProducts");
  const status = root.querySelector("#oodSaveStatus");
  const rowIndex = new Map(count.products.map((p, i) => [p.id, i]));
  const syncProgress = () => {
    const totals = current().products.map(oodTotals);
    const complete = totals.filter((t) => t.complete).length;
    root.querySelector("#oodProgress").innerHTML = `<strong>${complete}/${totals.length} confirmed</strong> · ${totals.filter((t) => t.state === "under").length} shortages · ${totals.filter((t) => t.state === "over").length} extras`;
    const review = root.querySelector("#reviewOOD");
    if (review) review.textContent = `Review count · ${complete}/${totals.length}`;
  };
  const summary = (t) => `<strong>Counted ${n(t.total)}</strong><strong>Variance ${n(t.variance)}</strong><span>${states[t.state]}</span>`;
  const paint = () => {
    const search = root.querySelector("#oodCountSearch").value.trim().toLowerCase();
    const category = root.querySelector("#oodCountCategory").value;
    const filter = root.querySelector("#oodCountFilter").value;
    list.innerHTML = current().products.filter((p) => {
      if (category && p.category !== category || search && !`${p.plu} ${p.description} ${p.category}`.toLowerCase().includes(search)) return false;
      const t = oodTotals(p);
      return !filter || (filter === "unfinished" ? !t.complete : filter === "risk" ? t.complete && OOD_BUCKETS.slice(0, 4).some(([key]) => Number(p.buckets[key]) > 0) : t.state === filter);
    }).map((p) => {
      const t = oodTotals(p), i = rowIndex.get(p.id);
      return `<article class="product oodProduct ${t.state}" data-ood-row="${i}"><div class="productTop"><div><div class="productName">${e(p.description)}</div><div class="productMeta">PLU ${e(p.plu)} · ${e(p.category)}${p.unit ? ` · ${e(p.unit)}` : ""}</div></div><div class="onHand">On Hand<b>${n(p.onHand)}</b></div></div>
      <div class="oodBuckets">${OOD_BUCKETS.map(([key, label]) => `<label class="field"><span>${label}</span>${editing ? `<input aria-label="${label} for ${e(p.description)}" inputmode="decimal" autocomplete="off" data-bucket="${key}" value="${e(p.buckets[key])}">` : `<strong>${n(oodBucketValue(p, key, t.complete))}</strong>`}</label>`).join("")}</div>
      <div class="oodRowSummary"><div data-ood-summary>${summary(t)}</div>${editing && !p.confirmed ? '<button type="button" class="secondary" data-ood-zero>Confirm zero</button>' : ""}</div></article>`;
    }).join("") || '<section class="card empty">No products match these filters.</section>';
  };
  for (const id of ["#oodCountSearch", "#oodCountCategory", "#oodCountFilter"]) root.querySelector(id).addEventListener(id.endsWith("Search") ? "input" : "change", paint);
  syncProgress(); paint();

  function save(next) {
    status.textContent = "Saving…";
    const pending = autosave(next);
    pending.then(() => {
      if (status.isConnected && current() === next) status.textContent = "Saved on this tablet";
    }, (error) => {
      if (status.isConnected && current() === next) status.textContent = `Not saved: ${error.message} Keep this screen open and retry.`;
    });
    return pending;
  }
  function editRow(target, key, value) {
    const article = target.closest("[data-ood-row]");
    const latest = current(), index = Number(article.dataset.oodRow);
    const next = updateOODRow(latest, latest.products[index].id, key, value);
    const totals = oodTotals(next.products[index]);
    article.className = `product oodProduct ${totals.state}`;
    article.querySelector("[data-ood-summary]").innerHTML = summary(totals);
    article.querySelector("[data-ood-zero]")?.remove();
    if (key === null) article.querySelectorAll("[data-bucket]").forEach((field) => { field.value = "0"; });
    save(next); syncProgress();
  }
  if (editing) {
    root.querySelector("#oodAreas").oninput = (event) => {
      const next = { ...current(), countMode: "ood", areaLabel: event.target.value.trim() || undefined };
      root.querySelector("#oodCountTitle").textContent = countTitle(next);
      save(next);
    };
    list.oninput = (event) => { if (event.target.matches("[data-bucket]")) editRow(event.target, event.target.dataset.bucket, event.target.value); };
    list.onclick = (event) => { if (event.target.matches("[data-ood-zero]")) editRow(event.target, null, ""); };
    list.onfocusin = (event) => { if (event.target.matches("[data-bucket]") && event.target.value === "0") event.target.select(); };
    root.querySelector("#oodCountDate").onchange = (event) => {
      const checkedOn = event.target.value;
      try { parseDate(checkedOn); addMonths(checkedOn, 3); if (checkedOn > dubaiToday()) throw new Error("Choose today or an earlier check date."); }
      catch (error) { event.target.value = current().checkedOn; status.textContent = error.message; return; }
      if (current().products.some((p) => p.confirmed) && !window.confirm("Changing the date shifts the expiry windows. Keep the current quantities and check their buckets again?")) { event.target.value = current().checkedOn; return; }
      work(async () => { await save({ ...current(), checkedOn }); if (list.isConnected) show("entry"); });
    };
    root.querySelector("#reviewOOD").onclick = () => show("review");
    setupUpload();
  } else {
    root.querySelector(saved ? "#backOODHistory" : "#editOOD").onclick = () => show(saved ? "history" : "entry");
    root.querySelector("#exportOOD").onclick = () => work(() => {
      const latest = current();
      if (latest.products.some((p) => !oodTotals(p).complete) && !window.confirm("Download this partial count? Unfinished rows show entered quantities, with totals and variance left blank.")) return;
      const name = latest.fileName.replace(/\.xlsx$/i, "").replace(/[^a-z0-9_-]+/gi, "-");
      download(exportOODCount(latest), namedWorkbook(saved ? latest : { ...latest, countMode: "ood" }) || `${name}-OOD-${latest.checkedOn}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      toast("OOD Excel downloaded.");
    });
    const archive = root.querySelector("#archiveOOD");
    if (archive) archive.onclick = () => work(async () => {
      const unfinished = current().products.filter((p) => !oodTotals(p).complete).length;
      if (unfinished && !window.confirm(`${unfinished} products are unfinished. Save this partial count to OOD History?`)) return;
      await persist(archiveOODCount(getVault()));
      show("history");
      toast("Saved to OOD Count History.");
    });
  }

  function setupUpload() {
    const upload = root.querySelector("#oodUpload");
    upload.onchange = () => {
      const file = upload.files[0]; upload.value = "";
      if (!file) return;
      work(async () => {
        const source = importInventory(await file.arrayBuffer(), file.name);
        if (!upload.isConnected) return;
        const existing = getVault().oodDraft;
        if (existing && !window.confirm(existing.products.some((p) => p.confirmed)
          ? "Discard this OOD draft and replace it with the new file? Cancel to keep it or save it to OOD History first."
          : "Replace the unstarted OOD draft with this stock file?")) return;
        const next = createOODCount(source, dubaiToday(), getVault().settings?.shelfLifeMonths ?? 7);
        await persist({ ...getVault(), oodDraft: next });
        show("entry"); toast(`${next.products.length} products ready for OOD counting.`);
      });
    };
  }
}
