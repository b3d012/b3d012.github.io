# Lush Inventory Counter — Design Specification

## Purpose

Create a tablet-first inventory counting web app for the Lush Al Ain shop. Each week, a supervisor uploads the untouched Excel inventory export. The app extracts the required product data, gives staff a clear touch interface for counting stock in three locations, saves progress locally, and exports a completed Excel workbook for next-day review and system entry.

The app replaces the printed counting sheet. It must be faster and easier to use than paper, work on one shared Android tablet, and remain usable without an internet connection after installation.

## Confirmed Decisions

- One shared tablet; no multi-device synchronization.
- No accounts, logins, or staff-name tracking.
- The system On Hand quantity remains visible while counting.
- Results are available both in an in-app review screen and as a downloadable Excel file.
- The app is deployed as an installable PWA under a private-by-URL subpath of b3d012.github.io.
- Inventory files and counts never leave the device.

## Source Workbook

The reference export is PreChanges.xlsx, containing one worksheet named Store Inventory Journal and 21 columns. The app must identify columns by normalized header text rather than fixed column positions.

Required source fields:

| Source header | App field |
| --- | --- |
| Category | Category |
| Item No.(PLU) | PLU |
| Description | Description |
| On Hand Qty. | On Hand |

The output adds three editable count fields: Display, Cupboard, and Store Room.

Header matching must ignore differences in capitalization, leading/trailing whitespace, repeated spaces, and minor punctuation differences. If any required field is missing or ambiguous, the app must reject the import and identify the unresolved field. It must not guess from unrelated numeric columns.

Each imported row becomes one product. PLUs must be stored as text so long identifiers and leading zeros remain intact. Numeric values must preserve decimals and negative values. Completely empty rows are ignored.

## Main User Flow

### 1. Home

When no count exists, the home screen presents one primary action: Upload weekly inventory file.

When a saved count exists, the home screen instead emphasizes Continue current count and displays the original file name, import date and time, product count, and completed product count and percentage.

A secondary Start new count action opens an upload flow. Replacing an existing count requires an explicit confirmation that names the current file and completion percentage.

Accepted input is .xlsx. Invalid or unsupported files produce a plain-language error without altering the current saved count.

### 2. Import Preview

After parsing, the app shows the file name, number of products, number of categories, detected source columns, and a short preview of the first products. The user confirms before the imported file becomes the active count. Importing does not modify the original file.

### 3. Counting

Products are grouped by Category. The screen provides a sticky header with progress, current category, search, and Review action; a large category selector; search by product description or PLU; and product rows sized for an Android tablet in portrait and landscape.

Each product row shows:

- Description as the strongest label
- PLU and Category as supporting information
- Visible On Hand quantity
- Display, Cupboard, and Store Room numeric inputs
- Calculated Counted Total
- Calculated Variance, where Variance = Display + Cupboard + Store Room - On Hand

Input requirements:

- Blank and zero are different states.
- Blank means the location has not been counted.
- 0 means the location was counted and no stock was found.
- Integers, decimals, and negative corrections are accepted.
- Inputs use a numeric keyboard where supported.
- Each field includes an easy one-tap zero action.
- Values are saved on input, not only when leaving the page.
- A product is complete only when all three location fields contain valid numbers.

Row states are Not started, In progress, Complete, and Variance alert. Color must never be the only status signal; text labels or icons accompany status colors.

### 4. Review

The review screen displays Total products, Complete, Incomplete, Matching On Hand, Under, and Over. Filters include All, Incomplete, Matching, Under, and Over.

Each review row shows Description, PLU, On Hand, the three location counts, Counted Total, and Variance. Selecting a row returns to the corresponding product for correction.

Export is available at any time. If one or more products are incomplete, the app clearly reports how many and requires confirmation before creating the export. Blank fields remain blank; the app must not silently convert them to zero.

### 5. Export and Backup

The primary export is an .xlsx workbook matching the seven-column structure of Ready.xlsx:

1. Category
2. Item No.(PLU)
3. Description
4. On Hand Qty.
5. Display
6. Cupboard
7. Store Room

The export preserves original row order, decimal and negative numeric values, PLUs as identifiers, and the worksheet name Store Inventory Journal. It uses readable column widths, bold text, alternating light rows, and clear borders comparable to the reference workbook. The filename includes the original base name and date.

The app also supports a JSON backup containing parsed product data, counts, source file metadata, schema version, and saved timestamp. Restoring a backup requires confirmation and validates the schema before replacing the current count.

## Offline Storage and Privacy

- All parsing, counting, review, export, and backup operations occur in the browser.
- No inventory content is sent to GitHub, analytics, an API, or any server.
- The active count is stored in IndexedDB, with small preferences allowed in localStorage.
- Every valid field change is persisted immediately.
- The PWA shell and spreadsheet-processing library are cached locally after the first successful load.
- A refresh, browser restart, tablet restart, or temporary loss of connectivity must not erase the active count.
- The user receives a visible saved-state indicator.

Private-by-URL means the app is unlinked from the public portfolio navigation, not authenticated. Anyone who knows the URL can open the app, but they cannot see inventory data because inventory remains on the local device.

## Visual Design

The interface should feel related to the existing cleaning app but be optimized for dense inventory work.

- High-contrast neutral background with restrained Lush-inspired accents
- Minimum 44px touch targets
- Large readable product descriptions
- Persistent context while scrolling
- No spreadsheet-like horizontal scrolling for the primary counting flow
- Clear numeric alignment
- Portrait and landscape tablet layouts
- Desktop layout remains functional for supervisors
- No decorative animation that delays counting

On wider screens, the three count inputs may appear in a single row. On narrow portrait screens, inputs may wrap below the product details while retaining clear labels.

## Technical Architecture

The app is a static PWA suitable for GitHub Pages: semantic HTML, modular CSS, browser JavaScript, no backend, a locally bundled browser-compatible XLSX parser/writer, IndexedDB storage, a scoped service worker, and a web app manifest.

Recommended project path: /lush-inventory/

Recommended public URL: https://b3d012.github.io/lush-inventory/

Suggested module boundaries:

- xlsx-adapter: imports, validates, normalizes, and exports workbooks
- count-store: owns active-count persistence and backup restore
- count-model: validation, completion, totals, and variance
- router: home, import preview, count, and review views
- ui: reusable product row, filters, dialogs, progress, and notifications
- service-worker: app-shell caching and offline updates

The spreadsheet library must be stored within the deployed app rather than loaded from a third-party CDN so first-load caching and later offline use are reliable.

## Error Handling

- An unreadable file leaves the existing count untouched.
- Missing required columns are listed by name.
- Duplicate required headers block import and explain the ambiguity.
- Rows with missing Category, PLU, or Description are identified before confirmation.
- Invalid numeric input is visibly marked and excluded from completion.
- Storage failures show a persistent warning and offer an immediate JSON backup.
- Export failures do not alter saved count data.
- Service-worker update failures never block the currently cached version.

## Testing and Acceptance

Automated tests cover header normalization, required-column detection, mapping from 21 source columns to the seven-column model, PLU preservation, decimal and negative quantities, blank versus zero, completion and variance calculations, IndexedDB persistence, JSON restore, Excel export order and values, and incomplete-export warnings.

Manual tablet checks verify:

- Uploading the provided PreChanges.xlsx yields 119 products and the expected categories.
- Counts remain after refresh and browser restart.
- The app works after the network is disabled.
- Touch targets and numeric entry are comfortable in portrait and landscape.
- Search and category navigation remain responsive with the reference file.
- Exported Excel reopens successfully and matches the expected seven-column structure.
- No inventory data appears in network requests after the app shell is loaded.

## Deployment

Implementation will be added to the b3d012.github.io repository under its own subdirectory without adding a visible link from the public portfolio. Deployment uses the repository's existing GitHub Pages branch and conventions. The exact branch and directory structure must be inspected before changes are made.

If direct repository access is unavailable, the deliverable will include a ready-to-deploy app folder and ZIP package, but publication itself will be reported as pending rather than implied complete.

## Out of Scope

- Multiple simultaneous devices
- User accounts or staff attribution
- Cloud storage or synchronization
- Direct connection to the inventory system
- Barcode scanning
- Editing product master data
- Hiding On Hand quantities
- Analytics across multiple weekly counts
