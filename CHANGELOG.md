# Changelog

## Unreleased

- **A failed erase no longer leaves a hidden row behind.** Stopping a running
  session archives it first; if the erase then fails, the row is un-archived
  and reappears, so "deleted" never means "hidden but still on disk". The
  un-archive is skipped when the directory is actually gone.
- **`/session-editor delete` requires `--confirm`.** A typed command has no
  dialog to tick, so the flag is its acknowledgement: without it the command
  returns the usage line and touches nothing. The menu and the replace flows
  pass it automatically.
- **Editing a message with attachments warns instead of dropping them
  silently.** The prompt endpoint only accepts freshly uploaded content, and a
  recorded attachment id cannot be replayed into it, so the edit dialog now
  names the attachments and gates the resend behind an acknowledgement.
- The plugin-list description no longer advertises a seven-day trash; deletion
  has been permanent since 0.1.2.
- **Repository renamed to `dsh-session-editor`.** An npm package named
  `dsh-session-toolkit` belongs to an unrelated plugin by another author, so
  the repository no longer shares that name. The package name was already
  `dsh-session-editor` and is unchanged. Existing
  `github:wodebilu/dsh-session-toolkit` installs keep resolving through
  GitHub's rename redirect, but reinstalling from the new address is preferred.

## 0.1.2 — 2026-10-19

- **Delete now erases the file *and* drops the sidebar row.** The order is
  stop → flush → erase → archive → notify. Erasing before archiving means a
  failed erase reports an error instead of hiding a row whose log still
  exists. The row disappears immediately; the registry entry is rebuilt from
  disk on the next start, and the plugin never writes `workspace.json`.
- The sidebar delete sent the retired command name `session-toolkit`; both
  call sites now send `session-editor`.
- Subagent sessions are deletable like any other stored session; only a
  session that still has subagent children is refused.
- `apply()` no longer swallows command-registration failures.

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
