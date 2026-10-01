# Stock Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Upgrade the existing inventory PWA with faster Cycle Count, private history and batch-level OOD tracking while preserving tablet data.

**Architecture:** Keep the current static JavaScript PWA and counting store. Add explicit row completion/provenance, a separately encrypted coordinator vault, pure history/expiry calculations and a coordinator UI module. All records remain local; publish only application code under the existing inventory URL.

**Tech Stack:** Browser ES modules, IndexedDB, Web Crypto, existing vendored xlsx-js-style, Node test runner, fake-indexeddb, jsdom and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-stock-coordinator-design.md`

## Global Constraints

- Preserve `/lush-inventory/`, seven-column count export, offline operation, existing saved counts and legacy count backups.
- Default zero is unconfirmed; MAX is `carried-forward`, not `physical-recount`.
- PIN protects coordinator history and notes; five-minute inactivity and backgrounding lock it. Never publish the plaintext initial PIN or private records.
- OOD defaults to production date plus seven calendar months; dates use Asia/Dubai. Label the date itself `Off shelf today`; later dates are overdue.
- Track multiple batches separately and use explicit printed-date overrides when supplied.
- No daily export requirement, invented sales metrics, automated stock adjustments, staff attribution or automatic tester-wastage confirmation.
- Partial departmental imports preserve unrelated departments and never imply absent products have zero stock.

## Review Focus

- An input containing temporary invalid text must not silently export a previous valid count; keep the row incomplete and mark the field invalid (Tasks 1, 7).
- Interleaved saves must not overwrite newer values, and failed archives must preserve the active count (Tasks 3, 4).
- An identical unresolved shortage seen again is a repeated observation, not automatically a new financial loss (Task 4).
- Date boundaries, month ends, future production dates and expiry overrides must be explicit (Task 5).
- A malformed, wrong-PIN or unsupported-version full backup must leave active count and vault unchanged (Task 6).

## Files and responsibilities

- Modify `lush-inventory/src/count-model.js` and `app-logic.js`: completion, provenance, MAX, confirm-zero, validation.
- Modify `src/xlsx-adapter.js`: source metadata and safe count/report export.
- Modify `src/count-store.js`: migrated active counts, serial saves and atomic full-state replacement.
- Create `src/coordinator-store.js`: encrypted vault persistence and PIN lifecycle.
- Create `src/history-model.js`: archival, product matching, revisions, resolution links and summaries.
- Create `src/expiry-model.js`: Dubai dates, month addition, batches and OOD checks.
- Create `src/coordinator-ui.js`: PIN entry, Overview, History, OOD and backup/report screens.
- Modify `src/app.js`, `styles.css` and `sw.js`: integration, count controls, update handling and offline module caching.
- Add focused tests beside the current tests, and extend the browser suite.

### Task 1: Explicit counting state and provenance

**Files:** `src/count-model.js`, `src/app-logic.js`, `tests/count-model.test.js`, `tests/app-logic.test.js`.

**Interfaces:** Retain `productTotals(product)`, `productStatus(product)` and `summarizeProducts(products)`. Add `applyMax(product, now)`, `confirmZero(product, now)` and `migrateCount(count)`. `updateProductField(products, id, field, raw)` records invalid input rather than silently retaining a previous value. Rows carry `confirmed`, `provenance`, `countedAt` and `events`.

- [ ] Write tests: untouched zero row is incomplete; confirm-zero completes; MAX copies exact `1.45`/`-2`; MAX then edit becomes physical; cleared/invalid rows become incomplete; legacy blanks and valid zero counts preserve their status.
- [ ] Run `node --test tests/count-model.test.js tests/app-logic.test.js` in `lush-inventory`; confirm new assertions fail for the intended missing behavior.
- [ ] Implement the interfaces, preserving legacy schema-1 compatibility and existing numeric precision.
- [ ] Run the same tests and require zero failures.
- [ ] Commit only the affected model and test files.

### Task 2: Enriched source import and safe Excel output

**Files:** `src/xlsx-adapter.js`, `tests/xlsx-adapter.test.js`.

**Interfaces:** Extend `importInventory(bytes, fileName)` to schema 2 with optional `department`, `unit`, `season`, `cost`, `postingDate`, source summaries and `warnings`. Retain `exportInventory(count)` and add `exportCoordinatorReport(vault)` returning workbook bytes.

- [ ] Add fixture assertions for 119 products, source date, department, cost and unit; test absent cost, duplicate PLUs, ambiguous units and repeated source-summary fields. Add export assertions that untouched default-zero rows are blank and confirmed zero rows are numeric zero.
- [ ] Run `node --test tests/xlsx-adapter.test.js`; confirm the new tests fail.
- [ ] Implement optional-field extraction and deterministic conflicting-identifier warnings. Preserve exact PLU strings. Export current seven-column layout plus separate history/outcomes/OOD report sheets with typed quantities/dates and provenance labels.
- [ ] Run adapter tests, reopen generated workbooks and inspect representative values and styles.
- [ ] Commit the adapter and tests.

### Task 3: Local storage migration and encrypted coordinator vault

**Files:** `src/count-store.js`, new `src/coordinator-store.js`, `tests/count-store.test.js`, new `tests/coordinator-store.test.js`.

**Interfaces:** Retain active-count store APIs. Add `loadEnvelope()`, `saveEnvelope(envelope)`, `unlockVault(pin)`, `saveVault(vault)`, `lockVault()` and `changePin(oldPin, newPin)`. Vault schema is `{schemaVersion:1, archives:[], expiryRecords:[], departmentChecks:[], events:[]}`; encrypted envelope includes version, salt, PBKDF2 iterations, AES-GCM nonce and ciphertext.

- [ ] Add migration and legacy-backup round-trip tests; add correct/wrong PIN, encrypted persistence, corrupt envelope, concurrent saves, change-PIN and lock-state tests. Assert stored ciphertext contains no private test note.
- [ ] Run `node --test tests/count-store.test.js tests/coordinator-store.test.js`; confirm new expectations fail.
- [ ] Implement non-destructive IndexedDB upgrade and serialized writes. Use PBKDF2-SHA256 with 250,000 iterations and AES-256-GCM, random per-vault salt and fresh 12-byte nonce on each save. Generate the initial salted PIN verifier without checking plaintext into source. Keep decrypted values/key in memory only; clear them on lock.
- [ ] Run the same tests and require zero failures, including failure preserving the previous saved state.
- [ ] Commit only storage, verifier configuration and tests. Do not include the PIN generator input or local vault files.

### Task 4: Historical counts, resolution records and useful summaries

**Files:** new `src/history-model.js`, new `tests/history-model.test.js`.

**Interfaces:** `archiveCount(vault, count, now) -> vault`, `reviseOutcome(vault, archiveId, productId, change, now) -> vault`, `linkDiscrepancies(vault, references, note, now) -> vault`, `compareSnapshots(previous, current) -> rows`, `historySummary(vault) -> summary`. Archived source/count observations are immutable; outcome revisions are separate append-only events.

- [ ] Write tests that raw observations survive declared-quantity changes, archive identifiers deduplicate repeated saves, absent departments survive, old/new PLUs only link explicitly, missing cost remains unknown and incompatible units never aggregate. Assert two observations of the same unresolved shortage report two observations without claiming two new loss events.
- [ ] Run `node --test tests/history-model.test.js`; confirm missing behavior fails.
- [ ] Implement matching by PLU with department/unit conflict checks. Separate physical and accepted totals, source-cost estimates, pending/confirmed resolutions and manual seasonal review flags. Calculate only dated On Hand changes, not sales.
- [ ] Run history tests and require zero failures.
- [ ] Commit the history module and tests.

### Task 5: Batch OOD and rotating departmental checks

**Files:** new `src/expiry-model.js`, new `tests/expiry-model.test.js`.

**Interfaces:** `dubaiToday(now) -> YYYY-MM-DD`, `addMonths(date, months) -> YYYY-MM-DD`, `offShelfDate(record) -> date`, `expiryStatus(record, checkDate) -> status`, `saveExpiryRecord(vault, record, now) -> vault`, `recordDepartmentCheck(vault, department, date, nextDate) -> vault`. Records have stable IDs, production date, optional override date, PLU, department, quantity/unit, location/batch, observation date and closure events.

- [ ] Test 1 March + 7 months = 1 October, due-today versus overdue, January 31 month-end clamp, leap February, Dubai rollover, three-calendar-month inclusion, invalid/future production dates, separate batches and explicit override priority. Importing a file must not complete an OOD check or close a batch.
- [ ] Run `node --test tests/expiry-model.test.js`; confirm new behavior fails.
- [ ] Implement calendar-date operations, configurable default shelf life of seven months, date validation and explicit record updates/closures. Preserve closed batch history and record check-with-no-risk as a valid inspection.
- [ ] Run all expiry tests and require zero failures.
- [ ] Commit the expiry module and tests.

### Task 6: Validated full backup and restore

**Files:** `src/count-store.js`, `src/coordinator-store.js`, new `tests/full-backup.test.js`.

**Interfaces:** `createFullBackup(activeCount, envelope) -> json`, `validateFullBackup(json, pin) -> validatedState`, `replaceFullState(validatedState) -> Promise`. Preserve existing `createBackup(count)` and `restoreBackup(json)` semantics.

- [ ] Write tests for versioned round-trip of both stores, legacy count-only restore, malformed archives/batches/events, wrong PIN, unknown versions, tampered ciphertext and transaction failure. Assert both existing stores remain unchanged on every validation failure.
- [ ] Run `node --test tests/full-backup.test.js`; confirm missing behavior fails.
- [ ] Implement structural validation, decrypt-and-validate before restore, atomic IndexedDB replacement and a full pre-restore backup offer in the UI integration contract.
- [ ] Run full-backup and both storage suites and require zero failures.
- [ ] Commit backup behavior and tests.

### Task 7: Tablet counting and coordinator screens

**Files:** `src/app.js`, new `src/coordinator-ui.js`, `styles.css`, new `tests/coordinator-ui.test.js`, `tests/e2e/app.e2e.test.js`.

**Interfaces:** `mountCoordinator(root, {getActiveCount, saveActiveCount, onExit, toast})` renders the PIN gate then Overview/History/OOD. `lockCoordinator()` removes private content and calls `lockVault()`. Reuse pure models from Tasks 1, 4 and 5; storage/crypto from Task 3; reports from Task 2; backups from Task 6.

- [ ] Write DOM/browser scenarios for default zero, edit completion, confirm-zero, MAX label, invalid text blocking export, archive-before-replace, wrong PIN, manual/background/inactivity lock, archive/resolution revision, linked discrepancies, OOD multiple-batch entry and check-with-no-risk, backup/restore and report download. Ensure notes are escaped and no private markup remains when locked.
- [ ] Run focused DOM tests and `npm run test:e2e`; confirm newly added scenarios fail before UI implementation.
- [ ] Integrate new counting controls and coordinator entry point. Add short forms for source-date confirmation, archive outcomes, resolution reasons/linking, seasonal review, OOD entries/checks and close/update records. Show actual covered departments/dates, unknown cost coverage, accepted-versus-physical badges and non-blocking backup reminders. Require confirmation for partial export, count replacement and full restore; surface storage failures visibly.
- [ ] Run DOM tests and browser scenarios at tablet portrait/landscape sizes; inspect screenshots and ensure no horizontal overflow or awkwardly small targets.
- [ ] Commit UI, styles and browser tests.

### Task 8: Offline update, review and publication

**Files:** `sw.js`, PWA tests, project README; approved inventory files only.

**Interfaces:** A new versioned cache precaches every coordinator/model/configuration module. Existing installation opens the upgraded app while retaining IndexedDB.

- [ ] Extend PWA tests to assert every new imported module is cached and the cache version differs from v1. Add a browser scenario that seeds a legacy active count, loads the upgrade and verifies its values and private-vault lock after offline reload.
- [ ] Run the new PWA/migration scenarios; confirm they fail against the old shell.
- [ ] Update service worker and instructions: reopen online to receive the update; preserve data without uninstalling/clearing storage; explain local PIN privacy and backups. Complete one whole-branch review against the spec, correcting confirmed findings.
- [ ] Run `npm test`, syntax checks and browser suite; verify exported reports by reopening them. Compare staged paths against authorized scope and preserve unrelated CV/portfolio changes. Fetch latest remote state before publishing and integrate only approved app/documentation paths without overwriting other remote work.
- [ ] Publish through configured GitHub tooling to the existing Pages path, then smoke-test live import, MAX, reload, PIN, archive, resolution and OOD workflow. Report actual live URL, checks passed and concrete tablet update steps only after deployment is verified.

## Handoff

The written design is approved. Recommended execution is native/inline in this session because the tasks share model/storage interfaces and do not need multiple implementers. Review this plan before execution; subsequent work follows the selected inline method.
