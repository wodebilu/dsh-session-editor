# Changelog

## 0.1.1 — 2026-10-19

- **Deletion is now permanent.** The seven-day trash folder is gone: the
  verified session directory is erased from disk, and nothing is left behind.
  Users who only want a conversation out of the sidebar are pointed at the
  shipped **Archive** action, which keeps the data and can be undone.
- The delete dialog requires ticking “I understand this cannot be undone”
  before the destructive button becomes available, and it explains the
  Delete-vs-Archive difference inline.
- Menu label and copy changed to “Delete session permanently…”; the replace
  flows (regenerate / edit-and-resend / delete-turn) say “permanently deletes”
  too.
- README (EN/ZH) gained a Delete-vs-Archive comparison table.
- Removed `purgeTrashDir` / `moveToTrash`; the deletion path is now
  resolve → verify → archive/stop → flush → erase.
- Tests: permanent-delete assertions (no trash directory is left behind), the
  acknowledgement gate, and the refused-path case. All offline, no real
  sessions touched.

## 0.1.0 — 2026-10-19

- First release of the hardened rewrite.
- `sessionPersistence.locate` is no longer required: the Host resolves the
  artifact through `locate()`, `listArtifacts()`, or a verified root scan, and
  fails closed before touching any state.
- A running session is archived, cancelled, and awaited (15 s) before the
  directory is touched; a timeout aborts the deletion and restores the archive.
- Subagent children block deletion; fork children do not.
- The delete command refuses self-deletion races by waiting for the command
  lifecycle (`command/done`) to settle before erasing the artifact.
