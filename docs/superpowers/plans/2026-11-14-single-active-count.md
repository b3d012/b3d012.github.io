# One active count

Use the existing active-count slot for Pre Inventory, Cycle Count and OOD Count. Keep public OOD entry and Excel export independent of PIN state; route archiving through Coordinator. Preserve the current count on cancel or failed writes. Keep old encrypted OOD drafts available after unlock, with explicit recovery or archiving. Use one atomic write for private archive/recovery and the matching public count change. Preserve old active and full backups.

1. Test the shared start, cancel, resume, review and replacement flow.
2. Validate both active schemas and update backup/restore, encrypted archive and legacy recovery.
3. Verify all tests, request independent review and publish the versioned offline shell.
