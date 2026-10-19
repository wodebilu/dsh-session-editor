# Session Toolkit for DSH

**Unofficial** plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Not affiliated with DeepSeek.

Adds session deletion and SillyTavern-style direct conversation editing to the DSH Web UI.

> **Destructive by design.** Deleting a session removes its JSONL log from disk. Editing or deleting a turn replaces the conversation with a new session and deletes the original. There is no undo. Back up your DSH `sessions` directory if the data matters.

[中文说明](README.zh-CN.md)

## Features

| Action | Where | Behavior |
|---|---|---|
| Delete session | Session row `…` menu → **Delete session…** | Confirmation, stop running work, archive, delete the session directory from disk. |
| Regenerate | Action row under a finalized answer | Confirmation → new session from the same prompt → open it → delete the original session. |
| Edit prompt & resend | Same action row | Confirmation + text editor → new session with the edited prompt → delete the original. |
| Delete this turn and later | Same action row | New session ending before that turn → delete the original. |
| Edit my input | Hover a user message bubble | Copy / edit your own message; same replace-and-delete flow. |

## How "direct" editing works

DSH session logs are append-only; in-place rewriting is not supported. Each edit therefore creates a replacement session (forked before the target turn, title preserved), opens it, and deletes the source session. The visible result is immediate: the conversation becomes the edited one and the original is gone.

Consequences:

- The session id changes; the sidebar row is replaced (the title is preserved).
- There is no branch history left to return to.
- Deletion is tail-based: "from this turn onward", not "delete only a middle message".
- Editing text re-generates the answer; it is not a pure text-only edit.

## Requirements

- Tested with DSH `0.2.1-rc.2`. The plugin uses undocumented internal APIs (slot keys, `sessionPersistence.locate`, `agent.session.seq`, `persistence.flush`), so a DSH upgrade may break it. Pin a release and check the changelog.
- No third-party dependencies, no network calls, no telemetry.

## Install

### From GitHub

1. DSH sidebar → **Plugins** → **Add plugin**.
2. Paste the repository address:

   ```text
   https://github.com/wodebilu/dsh-session-toolkit
   ```

   or `github:wodebilu/dsh-session-toolkit`.
3. Install, then restart DSH once.

### From a local folder or ZIP

1. Download the repository ZIP and extract it somewhere permanent.
2. In **Add plugin**, paste the absolute path to the extracted folder (the one containing `package.json`).
3. Install and restart DSH.

> A folder install is a `link:` dependency: do not move or delete the folder afterwards. A Git/tarball install copies the package into the profile and is move-safe.

### Remove an older local copy first

Earlier builds used the package name `@local/dsh-session-toolkit`. Remove that bundle in **Plugins → Installed plugins** before installing this one, otherwise two client modules register the same slots.

## Usage

- Delete a session: session row `…` → **Delete session…** → confirm.
- Edit or delete a turn: hover the action row under a finalized answer → pencil / trash / regenerate icon → confirm.
- Edit your own message: hover a user bubble → copy / pencil.

The delete command is logged as a normal command row. When a session deletes itself, the Host waits for `command/done` to become durable and then removes the artifact, typically in tens of milliseconds.

## Compatibility and risks

- **User-message renderer replacement** — the plugin registers `conversation.chat.node` key `user` to add the hover actions, reusing the shipped `conversation.chat.user.content` Factory. A DSH change to that node contract can affect user-message rendering until the plugin is updated.
- **Internal APIs** — see Requirements. This is a community plugin, not a stable public extension point.
- **No warranty** — this is a destructive tool. Use it on data you can lose, and keep backups.

## Development

No build step: plain ESM Host code plus a browser bundle.

```bash
npm test
# equivalent to:
node test/host-smoke.mjs
node test/client-smoke.mjs
```

The host test uses a temporary directory and never touches real sessions.

## License

MIT. See [LICENSE](LICENSE).
