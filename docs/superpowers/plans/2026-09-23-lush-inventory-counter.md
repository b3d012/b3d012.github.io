# Lush Inventory Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish an offline-first tablet PWA that imports the weekly Lush inventory XLSX, collects counts for three locations, reviews variance, and exports the seven-column finished workbook.

**Architecture:** A static GitHub Pages app under `lush-inventory/` separates workbook conversion, count calculations, persistence, and UI. Browser-only XLSX processing uses a locally vendored SheetJS build; IndexedDB stores the active count; a scoped service worker caches the complete app shell.

**Tech Stack:** HTML5, CSS, ES modules, IndexedDB, SheetJS CE browser bundle, service worker, Node test runner, Playwright/Chromium for interaction checks.

**Spec:** `docs/superpowers/specs/2026-09-23-lush-inventory-counter-design.md`

## Global Constraints

- Publish only inside `lush-inventory/`; do not add a portfolio navigation link.
- One shared Android tablet; no backend, accounts, staff tracking, analytics, or synchronization.
- On Hand remains visible while counting.
- Blank means uncounted; numeric zero means counted with none found.
- All inventory parsing and storage stays on the device.
- XLSX processing must work offline after the first successful load.
- Output column order must exactly match `Ready.xlsx`.

## Review Focus

- Header variants with spaces or punctuation must map only to the four required source fields; ambiguous duplicates must block import.
- PLUs longer than JavaScript's safe integer range or containing leading zeroes must survive import/export as text.
- Blank, zero, decimal, and negative counts must retain distinct meanings through save, reload, review, and export.
- Replacing an existing count after a failed import must leave the existing count untouched.
- A cached older service worker must upgrade without deleting IndexedDB inventory data.

---

### Task 1: App shell and count model

**Files:**
- Create: `lush-inventory/index.html`
- Create: `lush-inventory/styles.css`
- Create: `lush-inventory/src/count-model.js`
- Create: `lush-inventory/tests/count-model.test.js`
- Create: `lush-inventory/package.json`

**Interfaces:**
- Produces: `parseCountValue(raw)`, `productStatus(product)`, `productTotals(product)`, `summarizeProducts(products)`.
- Consumes: plain product objects with `onHand`, `display`, `cupboard`, and `storeRoom`.

- [ ] Write Node tests proving blank differs from zero, decimals and negatives remain numeric, completion requires all three locations, and summary counts classify matching/under/over.
- [ ] Run `npm test -- count-model.test.js`; expect failure because the model does not exist.
- [ ] Implement the minimal pure count-model functions and accessible semantic page shell.
- [ ] Run the model tests and expect all to pass.
- [ ] Commit with `git commit -m "feat: add inventory count model and app shell"`.

### Task 2: XLSX import and export adapter

**Files:**
- Create: `lush-inventory/vendor/xlsx.full.min.js`
- Create: `lush-inventory/src/xlsx-adapter.js`
- Create: `lush-inventory/tests/xlsx-adapter.test.js`
- Copy fixture: `lush-inventory/tests/fixtures/PreChanges.xlsx`

**Interfaces:**
- Produces: `normalizeHeader(text)`, `importInventory(arrayBuffer, fileName)`, `exportInventory(count)`, and `downloadWorkbook(count)`.
- Consumes: SheetJS global `XLSX` and the count product shape from Task 1.

- [ ] Vendor a pinned SheetJS CE browser build locally and record its license/version.
- [ ] Write tests for exact header mapping, punctuation/space variants, duplicate required headers, missing headers, long PLUs, 119-row fixture import, decimals, negatives, seven-column output order, worksheet name, and blank-versus-zero export.
- [ ] Run the adapter tests and expect failure because the adapter does not exist.
- [ ] Implement strict import validation and workbook export matching Category, Item No.(PLU), Description, On Hand Qty., Display, Cupboard, Store Room.
- [ ] Re-run tests and open the generated workbook with an independent parser; expect all values and headers to match.
- [ ] Commit with `git commit -m "feat: import and export inventory workbooks"`.

### Task 3: Durable local storage and backup

**Files:**
- Create: `lush-inventory/src/count-store.js`
- Create: `lush-inventory/tests/count-store.test.js`

**Interfaces:**
- Produces: `loadActiveCount()`, `saveActiveCount(count)`, `clearActiveCount()`, `createBackup(count)`, `restoreBackup(json)`.
- Consumes: validated count objects with schema version 1.

- [ ] Write tests with fake IndexedDB for save/reload, immediate zero persistence, failed replacement preserving current data, schema validation, and JSON backup round-trip.
- [ ] Run the storage tests and expect failure because the store does not exist.
- [ ] Implement one IndexedDB database and atomic replacement transactions; JSON restore validates before writing.
- [ ] Re-run tests and expect all to pass.
- [ ] Commit with `git commit -m "feat: persist inventory counts and backups"`.

### Task 4: Tablet counting and review UI

**Files:**
- Create: `lush-inventory/src/app.js`
- Modify: `lush-inventory/index.html`
- Modify: `lush-inventory/styles.css`
- Create: `lush-inventory/tests/app.e2e.test.js`

**Interfaces:**
- Consumes: Tasks 1–3 modules.
- Produces: Home, import preview, count, and review views; category/search filters; saved indicator; export and backup actions.

- [ ] Write browser tests that upload the fixture, confirm 119 products, navigate categories, search by PLU/name, enter blank/zero/decimal/negative values, refresh to verify persistence, filter review statuses, warn on incomplete export, and reject a bad upload without replacing the active count.
- [ ] Run the browser test and expect failure because app behavior is incomplete.
- [ ] Implement import preview, responsive product cards, sticky controls, 44px targets, visible On Hand, three labeled numeric fields, one-tap zero, total/variance, status text, progress, review filters, correction navigation, export, and backup/restore.
- [ ] Re-run browser tests in tablet portrait and landscape viewports; expect all to pass.
- [ ] Perform keyboard and screen-reader label checks; verify color is not the only status cue.
- [ ] Commit with `git commit -m "feat: add tablet inventory counting workflow"`.

### Task 5: Offline PWA and deployment assets

**Files:**
- Create: `lush-inventory/manifest.webmanifest`
- Create: `lush-inventory/sw.js`
- Create: `lush-inventory/icon.svg`
- Create: `lush-inventory/README.md`
- Modify: `lush-inventory/index.html`

**Interfaces:**
- Consumes: all app assets from Tasks 1–4.
- Produces: installable standalone PWA scoped to `/lush-inventory/`.

- [ ] Add tests/checks for manifest scope/start URL, required cached assets including vendored XLSX, offline navigation, and cache-version upgrade behavior.
- [ ] Implement network-first HTML with safe cached fallback and cache-first immutable local assets; do not cache uploaded inventory files.
- [ ] Run Lighthouse/PWA checks and a real offline reload; verify the active count remains available.
- [ ] Run the full test suite and production static-server browser flow using `PreChanges.xlsx`.
- [ ] Commit with `git commit -m "feat: make inventory counter installable offline"`.

### Task 6: Final verification and publish

**Files:**
- Modify only files revealed by failed verification.

**Interfaces:**
- Consumes: complete `lush-inventory/` app.
- Produces: live GitHub Pages deployment at `https://b3d012.github.io/lush-inventory/`.

- [ ] Compare import output against `Ready.xlsx`: 119 products, seven columns, original order, decimal and negative values preserved.
- [ ] Complete a representative count, export XLSX, reopen it, and verify three location fields plus On Hand values.
- [ ] Confirm network logs contain no inventory payloads and no third-party runtime dependencies.
- [ ] Run all tests, offline checks, and responsive screenshots; fix only verified failures and re-run affected checks.
- [ ] Push the completed commits to `main` and poll the GitHub Pages URL until it returns the new app.
- [ ] Perform a final live smoke test: load, upload, count, refresh, review, export, and offline reload.
