# Shared count entry

**Goal:** Import the same stock workbook for Pre Inventory, Cycle Count, and OOD Count. Fill the editable Areas field from departments. Coordinator has only Overview and History, with OOD as a History mode.

**Design:** Keep the stock file picker in the public count workflow. Parse before unlocking; then route the imported OOD draft through the existing PIN and encrypted vault. Keep regular and OOD drafts independent, preserve batch records under Overview, and combine archive listings without rewriting existing records.

1. Reproduce the file picker visibility interrupt and test the shared upload and OOD handoff.
2. Route home import/resume to encrypted OOD entry and combine archive listings; test replacement, lock/reopen and read-only archives.
3. Verify offline cache, full suite, and reviewed GitHub Pages deployment.
