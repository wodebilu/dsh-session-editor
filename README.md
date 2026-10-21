# Session Editor for DSH

**Unofficial** plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Not affiliated with DeepSeek.

Adds session deletion and SillyTavern-style direct conversation editing to the DSH Web UI.

> **Deletion is permanent: there is no trash and no undo.** A deleted session's log is erased from disk. If you are not sure a session truly has to go, **archive it first**: archiving only hides it from the sidebar, keeps the data, and can be undone at any time.

[中文说明](README.zh-CN.md)

## Features

| Action | Where | Behavior |
|---|---|---|
| Delete session | Session row `…` menu → **Delete session permanently…** | Resolve and verify the artifact path, archive the session, stop running work, then erase its directory from disk. Requires ticking “I understand this cannot be undone”. |
| Regenerate | Action row under a finalized answer | Confirmation → new session forked before the turn → same prompt resent → open it → original deleted permanently. |
| Edit prompt & resend | Same action row | Confirmation + text editor → new session with the edited prompt → original deleted permanently. |
| Delete this turn and later | Same action row | New session ending before that turn → original deleted permanently. |
| Edit my input | Hover a user message bubble | Copy / edit your own message; same replace-and-delete flow. |

## Delete or archive?

| | Delete | Archive |
|---|---|---|
| Session data | Permanently removed from disk | Kept |
| Can be restored | **No** | Yes — unarchive it |
| Leaves the sidebar | Yes | Yes |
| Frees disk space | Yes | No |

Deleting is a decision only you can make. If the only goal is “get this conversation out of my sidebar”, archive it — the data stays, and space is the only thing you save by deleting.

## How "direct" editing works

DSH session logs are append-only; in-place rewriting is not supported. Each edit therefore creates a replacement session (forked before the target turn, title preserved), opens it, and permanently deletes the source session. The visible result is immediate: the conversation becomes the edited one and the original leaves the sidebar.

Consequences:

- The session id changes; the sidebar row is replaced (the title is preserved).
- There is no branch history left to return to.
- Deletion is tail-based: "from this turn onward", not "delete only a middle message".
- Editing text re-generates the answer; it is not a pure text-only edit.
- Attachments on the message (images / files) are not re-sent: the log stores attachment ids and the prompt endpoint only accepts freshly uploaded content. Editing such a message warns and asks for a second acknowledgement instead of dropping them silently.

## Deletion safety

The plugin does **not** guess a path and delete it. Before any state changes it:

1. reads the stored header via `sessionPersistence.stat` and refuses a session that still has **subagent** children (fork children are allowed);
2. resolves the artifact through, in order:
   - a backend `locate(header)` when the harness provides one;
   - the JSONL backend's `listArtifacts()` (validated header → path);
   - `<persistence root>/<project>/<sessionId>` for each candidate root
     (`sessionPersistence.root`, its `config.root`, `$DSH_HOME/sessions`);
3. verifies that the directory is exactly one level under a root, is not a symlink, and contains a `session*.jsonl[.zstd]` file;
4. if the session is running, stops it and waits for it to become idle (15 s limit — otherwise nothing is deleted; stopping archives the row first);
5. calls `sessionPersistence.flush()`, then **erases the directory** from disk;
6. **archives** the row so the sidebar drops it immediately, without a restart.

The order matters. Erasing comes **before** archiving: a failed erase therefore reports an error instead of silently hiding a row whose log still exists. A running session is archived *before* the erase in order to stop it; when that erase then fails, the row is un-archived and reappears. Archiving only hides the row; the session id leaves the workspace registry on the next DSH start, when the registry is rebuilt from disk. The plugin never writes `workspace.json`.

A failed path lookup happens **before** any state change, so it leaves the session untouched.

There is no recovery afterwards. If you might want the conversation back, cancel at the confirmation dialog and archive the session instead.

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
   https://github.com/wodebilu/dsh-session-editor
   ```

   or install from a shell:

   ```powershell
   dsh plugin --profile web add github:wodebilu/dsh-session-editor
   ```

   The package name and the repository name are both `dsh-session-editor`.
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

- Delete a session: session row `…` → **Delete session permanently…** → tick the acknowledgement → confirm.
- Edit or delete a turn: hover the action row under a finalized answer → pencil / trash / regenerate icon → confirm.
- Edit your own message: hover a user bubble → copy / pencil.
- Manual delete (from any other session): `/session-editor delete <sessionId> --confirm`. The command is also what the menu and the replace flows use.
  A typed command has no dialog to tick, so `--confirm` is its acknowledgement: without it the command only returns the usage line and touches nothing, so a pasted line cannot delete a conversation by itself.

The delete command is logged as a normal command row. When a session deletes itself (the replace flows), the Host waits for the command lifecycle to become durable, then erases the directory.

## Configuration

No configuration is required. One constant is intentionally fixed rather than exposed:

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
