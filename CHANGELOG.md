# Changelog

## 0.1.0 — 2026-10-19

- First release of the hardened rewrite.
- `sessionPersistence.locate` is no longer required: the Host resolves the
  artifact through `locate()`, `listArtifacts()`, or a verified root scan, and
  fails closed before touching any state.
- Deletion moves the session directory to a sibling trash folder and purges
  entries older than seven days instead of erasing it immediately.
- A running session is archived, cancelled, and awaited (15 s) before the move;
  a timeout aborts the deletion and restores the archive.
- Subagent children block deletion; fork children do not.
- The delete command refuses self-deletion races by waiting for the command
  lifecycle (`command/done`) to settle before moving the artifact.
- Trash metadata is written next to each entry for manual recovery.
- Added offline tests that exercise the resolver without `locate()`.
