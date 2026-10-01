# Lush Inventory Counter

Tablet-first offline inventory counting app for weekly shop cycle counts.

## Use

1. Open the app and upload the untouched weekly `.xlsx` export.
2. Confirm the detected products and categories.
3. All locations start at zero, but a row stays unconfirmed until you edit it, confirm zero, or use MAX. MAX copies On Hand into Display, leaves the other locations zero, and records acceptance from pre-inventory.
4. Review incomplete items and variances.
5. Download the completed seven-column Excel workbook.

The active count is stored only in this browser on this device. Download the Excel workbook for encoding. Unconfirmed rows export blank; accepted rows and physical recounts remain distinct in coordinator records.

## Stock coordinator

Open **Coordinator** and use your owner PIN. The private section encrypts archived counts, follow-up notes and OOD batches on this tablet, and locks when backgrounded or after five minutes of inactivity. A four-digit PIN provides casual privacy; it cannot resist a determined offline attack against copied data. There is no cloud sync or account recovery.

Archive each Cycle Count before uploading the next week's departments. Archived source quantities and physical observations stay unchanged. Later edits to an archived active count create a linked amendment. Record the final quantity declared separately, with a reason, related discrepancy, seasonal review flag or tester follow-up. Pending testers stay open until you confirm wastage; imports cannot confirm it. Cost totals describe saved observations, which can include the same unresolved shortage several times. On Hand changes are stock snapshot differences and do not establish sales or theft.

Enter production dates per batch while checking each department. The default off-shelf date is production date plus **seven calendar months**, with month-end clamping. A printed override takes priority. Batches are due on that date and overdue afterwards; the tracker highlights the next three calendar months. Different batches stay separate, and closing a batch requires your action. Record a department check even if no risky batches were found.

Download a **full backup** after finishing each count. It includes the current count and encrypted private records. The normal count backup contains only the active count. A full restore validates its PIN and records before atomically replacing both stores, and offers a backup of existing data first. Keep the PIN used when each backup was created; changing your PIN does not change old backups. Coordinator Excel reports contain readable private notes.

## Updating the installed tablet app

Keep your saved browser data. **Do not uninstall the app or clear storage.** Open [the existing app](https://b3d012.github.io/lush-inventory/) online, then close and reopen it to load the updated offline shell. The top bar shows **v2.0** after updating. The same installed shortcut continues to work; reinstalling is unnecessary. If moving to another browser or tablet, restore a full backup there.

## Development

Run `npm install`, then `npm test` with the private environment variable `LUSH_TEST_PIN` set to the configured owner PIN. Never commit that value. Tests use real models, DOM handlers, Web Crypto and IndexedDB. `npm run test:e2e` additionally needs Playwright Chromium/WebKit binaries. Serve the repository root over HTTP and open `/lush-inventory/` for browser testing.
