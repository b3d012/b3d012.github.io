# Lush Inventory Counter

Tablet-first offline inventory counting app for weekly shop cycle counts.

## Use

1. Open the app and upload the untouched weekly `.xlsx` export.
2. Confirm the detected products and categories.
3. Enter Display, Cupboard, and Store Room quantities.
4. Review incomplete items and variances.
5. Download the completed seven-column Excel workbook.

The active count is stored only in the browser on the current device. Use the JSON backup action before clearing browser data or changing tablets.

## Development

Run `npm install`, then `npm test`. Serve the repository root over HTTP and open `/lush-inventory/` for browser testing.
