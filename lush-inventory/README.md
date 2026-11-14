# Lush Inventory Counter

Tablet-first offline inventory counting app for weekly shop cycle counts.

## Use

1. Open the app and upload the untouched weekly `.xlsx` export.
2. Confirm the detected products, choose **Pre Inventory**, **Cycle Count**, or **OOD Count**, and optionally edit the Areas field filled from the workbook’s departments. The name uses the Dubai date the count starts; OOD uses its check date. It appears in History and the downloaded Excel filename. Older archives retain their original names.
3. All locations start at zero, but a row stays unconfirmed until you edit it, confirm zero, or use MAX. MAX copies On Hand into Display, leaves the other locations zero, and records acceptance from pre-inventory.
4. Review incomplete items and variances.
5. Download the completed Excel workbook. The final Variance column shows On Hand minus the sum of Display, Cupboard, and Store Room. A positive value is a shortage; a negative value is an extra. Incomplete rows have a blank variance.

The active count is stored only in this browser on this device. Download the Excel workbook for encoding. Unconfirmed rows export blank; accepted rows and physical recounts remain distinct in coordinator records.

## Stock coordinator

Open **Coordinator** and use your owner PIN. The private section encrypts archived counts, follow-up notes and OOD batches on this tablet, and locks when backgrounded or after five minutes of inactivity. A four-digit PIN provides casual privacy; it cannot resist a determined offline attack against copied data. There is no cloud sync or account recovery.

Archive each Cycle Count before uploading the next week's departments. Archived source quantities and physical observations stay unchanged. Later edits to an archived active count create a linked amendment. Record the final quantity declared separately, with a reason, related discrepancy, seasonal review flag or tester follow-up. Pending testers stay open until you confirm wastage; imports cannot confirm it. Cost totals describe saved observations, which can include the same unresolved shortage several times. On Hand changes are stock snapshot differences and do not establish sales or theft.

Upload your stock Excel from Home, choose **OOD Count**, then enter the PIN. To continue an existing draft, use **Resume OOD Count** on Home. Count each unit in one of the five expiry windows. The **More than 3 Months to OOD** quantity is entered from the physical count so shortages remain visible. The draft saves as you work; use **Review count** to filter discrepancies, download Excel, and save a read-only snapshot to **Coordinator → History** (select **OOD Count** in the mode filter). The screen shows Counted minus On Hand; the workbook uses On Hand minus Counted, like the Cycle Count export. For printing, use landscape and fit all columns to one page wide.

Each OOD quantity field shows the production dates for its bucket, based on the check date and the count’s shelf life (seven calendar months by default). Change either setting in the OOD draft to update the labels. If a product has a printed expiry or off-shelf date, use the separate guide for that date. An item due on the check date goes in **Already OOD** for action that day. **Batch records** retains the individual batch tracker and department check form.

Download a **full backup** after finishing each count. It includes the current count and encrypted private records. The normal count backup contains only the active count. A full restore validates its PIN and records before atomically replacing both stores, and offers a backup of existing data first. Keep the PIN used when each backup was created; changing your PIN does not change old backups. Coordinator Excel reports contain readable private notes.

## Updating the installed tablet app

Keep your saved browser data. **Do not uninstall the app or clear storage.** Open [the existing app](https://b3d012.github.io/lush-inventory/) online, then close and reopen it to load the updated offline shell. The top bar shows **2.5** after updating. The same installed shortcut continues to work; reinstalling is unnecessary. If moving to another browser or tablet, restore a full backup there.

## Development

Run `npm install`, then `npm test` with the private environment variable `LUSH_TEST_PIN` set to the configured owner PIN. Never commit that value. Tests use real models, DOM handlers, Web Crypto and IndexedDB. `npm run test:e2e` additionally needs Playwright Chromium/WebKit binaries. Serve the repository root over HTTP and open `/lush-inventory/` for browser testing.
