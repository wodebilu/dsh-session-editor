# Changelog

## 1.0.0 — 2026-10-19

- Delete a session from the session-row menu, with confirmation.
- Regenerate, edit-and-resend, or delete a turn and later ones; each action replaces the conversation with a new session and deletes the original.
- Edit your own message from the user bubble (copy + edit actions).
- Event-driven session removal: waits for the command lifecycle `command/done` to become durable instead of using a fixed delay.
- Offline smoke tests for the Host delete path and the Client action flow.
