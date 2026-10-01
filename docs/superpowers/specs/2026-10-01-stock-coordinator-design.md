# Inventory Counter: Stock Coordinator Upgrade

## Purpose and approved scope

Extend the existing tablet inventory PWA at `/lush-inventory/` for its owner's stock-coordinator duties. Preserve the quick counting interface, offline operation, Excel export and existing tablet data. The owner mainly performs Monday Cycle Count; staff normally complete Sunday pre-inventory on paper. No daily whole-store export, staff accounts, staff surveillance, backend or mandatory Sunday digital workflow is required.

The owner approved default-zero inputs, a MAX action, a PIN-protected coordinator area, rotating departmental history, discrepancy records, OOD tracking and cautious movement reporting. The initial PIN is the four-digit value supplied privately in the conversation; do not put its plaintext value in this document or published source.

This document is the written-design review stage, not a statement that the app has been upgraded.

## 1. Cycle Count

- New counts show Display, Cupboard and Store Room as zero. Remove the individual quick-zero buttons.
- A separate completion flag distinguishes untouched zero defaults from confirmed zero counts. An edit commits the row as counted if all three values are valid. A `Confirm zero` action completes a genuinely zero row without requiring redundant edits. Invalid or cleared required input keeps a row incomplete.
- MAX sets Display to the exact current On Hand quantity and the other locations to zero. Preserve decimal and negative source quantities, with a visible warning for negative On Hand. MAX explicitly marks the row complete with provenance `carried-forward`, not `physical-recount`.
- MAX records that the owner accepted Sunday's verified total. It must not claim that actual locations were inspected or that the app has imported Sunday evidence.
- Editing a MAX row replaces its provenance with `physical-recount` after valid input. Preserve an event recording the change.
- Progress, filters, autosave, search, category navigation and export remain easy to use with large touch targets.
- Untouched zero rows do not enter historical discrepancy statistics. Incomplete Excel rows remain blank rather than silently exporting default zeros as verified results. Show a warning before a partial export.
- Starting a new count offers to archive the current one or download a backup; never silently overwrite unfinished work.

## 2. Source import and snapshots

Continue accepting the untouched source `.xlsx` and the existing four required columns. Additionally retain Department, Posting Date, Unit of Measure Code, Season and Cost (AED) when present. Missing optional fields do not prevent basic counting. Missing or invalid cost is unknown, not zero.

Each archived count retains an immutable source snapshot, source filename, actual import time, posting date, count time, row-level provenance and outcome. Posting Date is the source's stated date, not assumed proof of the exact extraction time. Missing dates require confirmation before dated historical comparison.

Use PLU as a string; retain long identifiers. Use department and unit-of-measure metadata to disambiguate conflicting rows. Never join records by array position or description alone. Detect duplicate/conflicting identifiers and show an import warning rather than silently merging them. Old/new PLUs are distinct unless the owner explicitly links them.

The same departments recur in later uploads. Compare only matching products with compatible units in those uploads. A product absent from a partial file is not zero stock, discontinued or checked. Show each department's last import and last completed count separately. No whole-shop live stock total is shown from mixed-date departmental snapshots.

Do not add repeated source-summary values such as `Total Cost (AED)` across rows. Preserve them as reported source summaries. Any derived stock values use row On Hand multiplied by that row's unit cost, with clearly identified missing-cost coverage.

## 3. Coordinator area and privacy

Keep normal counting directly accessible. Coordinator history, expiry records, resolution notes and reports require the owner's PIN. Provide an obvious lock action; lock after five minutes of inactivity, on reload and when the app is backgrounded. Unlock is memory-only, never a persistent session flag.

Use browser Web Crypto for an encrypted coordinator vault in IndexedDB, using a PIN-derived key, random salt, fresh authenticated-encryption nonce per save and versioned metadata. Never persist the plaintext PIN or decrypted coordinator vault. Provision the initial PIN through a verifier rather than embedding its plaintext in the public JavaScript. Allow changing the PIN only after successful unlock and successful re-encryption.

This is casual privacy on a shared tablet, not strong authentication: a four-digit PIN has limited resistance to determined offline guessing. The public URL and GitHub repository are not secrets. The existing active count remains accessible to someone using the counting screen. No private notes or historical records are published to GitHub.

Archive and report operations require unlock. A count can continue publicly without access to the private history. Failure to save the archive leaves the active count intact and visibly reports failure.

## 4. Physical observations and declared outcomes

Keep these separate:

1. Source On Hand quantity.
2. Observed physical quantity, only where actually recounted.
3. Accepted total from MAX, where no digital physical recount occurred.
4. Final quantity the owner chose to declare, if supplied.
5. Resolution reason, notes and follow-up status.

Never overwrite observed evidence with a declared quantity. Declared quantities and reasons are entered explicitly by the owner; the app does not choose or submit stock adjustments.

Resolution choices include recount correction, suspected wrong punch, old/new PLU mismatch, tester wastage pending, tester wastage confirmed, damage/transfer explanation, unresolved shortage and surplus retained for review. Allow a custom note and distinguish suspected explanations from confirmed ones.

Related positive/negative records can be manually linked with a reason. Their individual physical discrepancies remain visible. The app must not automatically net different products, declare a swap approved, or create a concealment workflow. A retained surplus remains a documented physical discrepancy even if the declared count differs.

Tester wastage remains pending until the owner confirms it. A later lower On Hand value is not evidence that wastage was processed. A manually confirmed action records its time and optional reference.

Finalizing a count creates an archived record. Later corrections append revision events with previous/new values, timestamp and note; they do not erase the original record. This local history is useful evidence, not a tamper-proof audit log.

## 5. History, cost and net stock changes

Provide dated count history searchable by department, category and PLU. Product detail shows source On Hand, counted/accepted total, discrepancy, provenance, declared quantity if entered and resolution history.

Value discrepancies using `counted total - source On Hand`, multiplied by the cost from that source snapshot, only when cost and unit interpretation are valid. Label monetary figures as cost-based estimates, not retail sales value. Show shortage value and surplus value separately rather than hiding them in one net number.

Do not sum unlike quantities such as kilograms and pieces. Show product-level quantities with their units; category summaries may aggregate compatible units only. Show invalid/missing-cost records and exclude them explicitly from monetary totals.

Repeated unexplained-shortage view shows affected count dates, number of occurrences and observed amounts. An unresolved identical variance across two counts is not automatically two separate loss events; distinguish repeated observations from new confirmed adjustments. MAX rows are accepted totals, not fresh physical evidence.

Source snapshot comparisons show `On Hand change` over the actual elapsed interval. Never label this as sales, sales velocity, theft or wastage. Unchanged On Hand is a review prompt, not proof of a slow seller: replenishment may offset sales. Mark missing earlier snapshot, differing units, changed costs and conflicting identifiers rather than inventing a result.

Season is shown as metadata with an optional owner-defined review flag. Do not infer that every seasonal product is obsolete or out of date.

## 6. OOD records and weekly checks

Expiry is batch-specific and absent from the source export. During the weekly department check, the owner records PLU, production date, affected quantity with unit, optional batch identifier, optional location and an explicit expiry/off-shelf override when available. Multiple production batches of one PLU must remain separate.

Default off-shelf date is production date plus seven calendar months. Clamp month-end dates to the last valid day of the target month. This rule was supplied by the owner and is configurable; do not present it as a verified universal product policy. An explicit printed expiry/off-shelf date takes priority and is shown with its basis.

At the date of checking, a product is OOD when the checking date is later than its off-shelf date, consistent with the owner's wording 'more than seven months'. The date itself is separately labelled `Off shelf today`. All calculations use calendar dates in Asia/Dubai, not UTC midnight or seven times thirty days.

Example: produced 1 March 2026, default off-shelf date 1 October 2026; off shelf today on 1 October and overdue on 2 October. This boundary is visible in the UI and tested.

Show overdue, off-shelf today, due within 30 days, due within 60 days, and due within three calendar months, with actual dates. The default OOD action list uses the inclusive next-three-calendar-month window, not a fixed 90 days. Store all recorded batches even if they are not currently in that window so they enter it automatically later.

Record department OOD checks separately from imports and counts. `Checked, no at-risk stock found` is a valid explicit check. Importing a file never marks an OOD inspection complete. Display last-checked date, selected check date and next review date. Sections are reviewed alongside the existing count rotation; no invented full-store rotation or notification schedule is required.

Affected quantities are physical observations as of a date, not live balances. Do not automatically decrement a batch from On Hand changes or presume it was sold. Closing/updating records requires the owner to choose sold, wasted, transferred, corrected or another note. Keep the closed record and its events.

## 7. Tablet interface

Preserve the existing visual style and fast counting page. Add a Coordinator entry point with PIN keypad. Inside use three clear destinations: Overview, History and OOD. Overview prioritizes pending resolutions, imminent OOD, departments due for review and repeat unexplained discrepancies.

Avoid overwhelming dashboards, unsupported confidence scores and staff attribution. Keep forms short, numeric fields touch-friendly, dates readable and consequential actions explicit. Coordinator summaries must clearly state which departments/dates they cover.

Reports can export a dated Excel workbook with count outcomes, discrepancy records and OOD records. Preserve the normal seven-column counted Excel export for the current workflow. Warn that exported reports are plaintext and may contain private notes.

## 8. Storage, backups and migration

Remain static, offline-first and local to the tablet. Extend the existing IndexedDB through non-destructive versioned migrations. Preserve schema-version-1 active counts, entered values, blanks and completion semantics; never convert an old untouched blank row into a confirmed zero row. Older records lack department/cost/production metadata and must remain explicitly unknown unless supplemented by the owner.

Support existing count backups plus a versioned full backup that includes active count and encrypted coordinator vault. Full restore validates structure, version and decryption before replacing anything, explains scope, requires confirmation and offers a backup of existing state. Wrong PIN, invalid JSON, unsupported versions, failed writes and storage quota errors must not delete good data.

Local storage is not cloud sync. Clearing browser data, losing the tablet or reinstalling into another browser can lose local information without a backup. Provide a visible, non-blocking backup reminder after archive operations. Do not automatically upload backups or reports.

Update the service-worker cache version and precache new modules. Ensure the existing app can transition without requiring users to clear their data. Publication changes only the inventory subfolder and related project documentation, preserving the portfolio and cleaning app.

## Acceptance checks

- Original source fixture imports all products, long PLUs, decimals, negative quantities and optional metadata without losing existing core fields.
- Default zero does not mark untouched rows complete; confirm zero, MAX, edit, clear, invalid input, autosave and reload behave consistently.
- MAX provenance and separate physical/declared values survive archive, export, reload and backup.
- Existing active counts and old backups migrate without data loss.
- Partial department imports do not erase other departments or fabricate zero stock. Duplicate/conflicting PLUs and incompatible units are handled visibly.
- Cost summaries handle missing cost, snapshot-specific cost, separate positive/negative totals and PCS versus KG correctly.
- Repeated-observation reporting does not double-count an unchanged unresolved shortage as new losses.
- OOD tests cover exactly seven months, month-end clamping, leap years, printed overrides, multiple batches, three-calendar-month boundaries and Dubai date rollover.
- Pending tester records cannot resolve themselves from snapshots; OOD records cannot auto-close from stock changes.
- PIN unlock/lock, wrong PIN, inactivity, backgrounding, change PIN and encrypted backups are tested. Sensitive records are absent from the locked UI and persisted plaintext.
- Restore failures and interrupted archive writes preserve existing state.
- Tablet portrait/landscape layouts, keyboard entry, offline reload, service-worker upgrade and live GitHub Pages operation are checked.

## Execution boundary

After written-design approval, create a task-by-task implementation plan for inline execution. Deliver the count improvements first, then the shared storage/history foundation, then OOD and coordinator reporting, with each step covered by tests. Publish the complete approved upgrade only after migration and backup tests pass and the live page is verified. No changes have been made to app behavior by writing this document.
