# Session Editor for DSH

**Unofficial** plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Not affiliated with DeepSeek.

Adds session deletion and SillyTavern-style direct conversation editing to the DSH Web UI.

> **Deletion is destructive, but reversible for seven days.** A deleted session's directory is moved to a sibling trash folder instead of being erased. Trash entries older than seven days are purged automatically. Editing or deleting a turn replaces the conversation with a new session and sends the original to the trash.

[中文说明](README.zh-CN.md)

## Features

| Action | Where | Behavior |
|---|---|---|
| Delete session | Session row `…` menu → **Delete session…** | Resolve and verify the artifact path, archive the session, stop running work, then move its directory to the trash. |
| Regenerate | Action row under a finalized answer | Confirmation → new session forked before the turn → same prompt resent → open it → original moved to trash. |
| Edit prompt & resend | Same action row | Confirmation + text editor → new session with the edited prompt → original moved to trash. |
| Delete this turn and later | Same action row | New session ending before that turn → original moved to trash. |
| Edit my input | Hover a user message bubble | Copy / edit your own message; same replace-and-trash flow. |

## How "direct" editing works

DSH session logs are append-only; in-place rewriting is not supported. Each edit therefore creates a replacement session (forked before the target turn, title preserved), opens it, and sends the source session to the trash. The visible result is immediate: the conversation becomes the edited one and the original leaves the sidebar.

Consequences:

- The session id changes; the sidebar row is replaced (the title is preserved).
- There is no branch history left to return to.
- Deletion is tail-based: "from this turn onward", not "delete only a middle message".
- Editing text re-generates the answer; it is not a pure text-only edit.

## Deletion safety

The plugin does **not** guess a path and delete it. Before any state changes it:

1. reads the stored header via `sessionPersistence.stat` and refuses subagent sessions;
2. refuses to delete a session that still has **subagent** children (fork children are allowed);
3. resolves the artifact through, in order:
   - a backend `locate(header)` when the harness provides one;
   - the JSONL backend's `listArtifacts()` (validated header → path);
   - `<persistence root>/<project>/<sessionId>` for each candidate root
     (`sessionPersistence.root`, its `config.root`, `$DSH_HOME/sessions`);
4. verifies that the directory is exactly one level under a root, is not a symlink, and contains a `session*.jsonl[.zstd]` file;
5. archives the session through `workspaceRegistry` and, if it is running, cancels it and waits for it to become idle (15 s limit — otherwise nothing is deleted);
6. calls `sessionPersistence.flush()`, then **renames** the directory into a sibling `dsh-session-editor-trash` folder next to the sessions root (same volume).

If any step fails, the session is restored from the archive and the command reports the reason. A failed path lookup happens **before** the archive, so a locate failure leaves the session untouched.

Trash layout:

```text
<sessions root>/../dsh-session-editor-trash/
  1760000000000-session-<uuid>/
    session.v4.jsonl.zstd
    session-editor-trash.json   # id, cwd, deletedAt, originalPath
```

To undo within the retention window, move the directory back to
`<sessions root>/<project>/<session-id>/` and unarchive the session (it was archived during deletion). To reclaim space immediately, delete the trash folder.

## Requirements

- Tested with DSH `0.2.1-rc.2`.
- The Host half uses documented services (`commands`, `agents`, `sessionPersistence`, `workspaceRegistry`) plus two backend details for path discovery: the JSONL backend's `listArtifacts()` and its `root` field. Both are feature-detected; a future harness that removes them falls back to `$DSH_HOME/sessions`. If none resolves, deletion fails closed.
- The Client half uses the internal slot keys and the `conversation.chat.user.content` factory. A DSH upgrade may break it.
- No third-party runtime dependencies, no network calls, no telemetry.

## Install

### From GitHub

1. DSH sidebar → **Plugins** → **Add plugin**.
2. Paste the repository address:

   ```text
   https://github.com/wodebilu/dsh-session-toolkit
   ```

   or install from a shell:

   ```powershell
   dsh plugin --profile web add github:wodebilu/dsh-session-toolkit
   ```

   The package name comes from `package.json` (`dsh-session-editor`), so the
   installed bundle is `dsh-session-editor` even though the repository is named
   `dsh-session-toolkit`.
3. Install, then restart DSH once.

Do **not** install it from npm as `dsh-session-toolkit`: that name belongs to a different plugin.

### From a local folder or ZIP

1. Download the repository ZIP and extract it somewhere permanent.
2. In **Add plugin**, paste the absolute path to the extracted folder (the one containing `package.json`).
3. Install and restart.

> A folder install is a `link:` dependency: do not move or delete the folder afterwards. A Git/tarball install copies the package into the profile and is move-safe.

### Remove an older local copy first

Earlier builds used the package names `@local/dsh-session-toolkit` or `dsh-session-toolkit`. Remove that bundle in **Plugins → Installed plugins** before installing this one, otherwise two client modules register the same slots.

## Usage

- Delete a session: session row `…` → **Delete session…** → confirm.
- Edit or delete a turn: hover the action row under a finalized answer → pencil / trash / regenerate icon → confirm.
- Edit your own message: hover a user bubble → copy / pencil.
- Manual delete (from any other session): `/session-editor delete <sessionId>`. The command is also what the menu and the replace flows use.

The delete command is logged as a normal command row. When a session deletes itself (the replace flows), the Host waits for the command lifecycle to become durable, then moves the directory.

## Configuration

No configuration is required. Two constants are intentionally fixed rather than exposed:

- trash retention: seven days;
- maximum wait for a running session to stop: 15 seconds.

## Compatibility and risks

- **User-message renderer replacement** — the plugin registers `conversation.chat.node` key `user` to add hover actions, reusing the shipped `conversation.chat.user.content` factory. A DSH change to that node contract can affect user-message rendering until the plugin is updated.
- **Internal APIs** — see Requirements. This is a community plugin, not a stable public extension point.
- **No warranty** — keep backups of data you cannot lose.

## Development

No build step: plain ESM Host code plus a browser bundle.

```bash
npm test
# equivalent to:
node test/host.test.mjs
node test/client.test.mjs
```

The Host test uses a temporary directory and never touches real sessions. It exercises the path resolver **without** a `locate()` implementation, and asserts that a failed lookup does not archive the session.

## License

MIT. See [LICENSE](LICENSE).
