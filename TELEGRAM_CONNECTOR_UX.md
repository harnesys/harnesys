# Telegram connector: UX rework

Status legend: `[ ]` open, `[x]` done.

## Goal

The Telegram settings page must answer three questions without leaving the app:
which chats the bot is in (by name, not id), where each chat goes (thread), and
whether the bot is healthy right now. No polling, no third-party id lookups.

Bot API has no "list my chats" call. Discovery is therefore built from the update
stream (`my_chat_member`, `channel_post`, messages, topic creation) plus an
explicit refresh that resolves names through `getChat`.

## Backend

- [x] Expose `pairExpiresAt` on `ConnectorPublic` so the UI can show that a pair link is still alive and when it dies.
- [x] `POST /orgs/:orgId/connectors/:connectorId/telegram/chats/refresh`: re-resolve every binding through `getChat`, rename unnamed chats (`Topic 42` -> group name / username / title), report chats the bot can no longer read.
- [x] `PATCH /orgs/:orgId/connectors/:connectorId/telegram/chats/:bindingId`: rename a chat or topic from the UI.
- [x] Subscribe the poller to `channel_post` / `edited_channel_post`, otherwise channels are never discovered or read despite the UI promising it.

## Discovery UI

- [x] One list of every chat the bot sees: name first, type and id secondary, grouped as direct messages, groups with nested topics, channels.
- [x] Search across chat names and ids.
- [x] Each row shows its destination inline: connected thread, or a thread picker + `Connect` without opening a separate wizard.
- [x] Chats without a name are marked as such and can be renamed in place.
- [x] Manual registration moves into a collapsed "Register a chat manually" section with instructions that do not require a third-party bot.
- [x] Empty states collapse into one compact line per group.

## Health and state

- [x] `error` status gets a working recovery action (`Retry`, which restarts the poller) instead of a dead `Pause`.
- [x] The pair block survives a page reload: active link, expiry, "create a new link" instead of vanishing state.
- [x] Manual refresh of the connector, so a user coming back from Telegram sees the new state without waiting.
- [x] Policy switches edit a draft and save explicitly; no PATCH race between fast toggles.
- [x] Destructive actions (pause, remove bot, forget chat, rename) move out of the primary row into a menu with their consequences spelled out.
- [x] Page starts with a state-driven checklist instead of a paragraph of prose.
- [x] Forum topics stay creatable from a group row, so the old action is not lost.

## Verification

- [x] `tsc --noEmit` for `packages/contracts` and `apps/webui`; `apps/server` reports only the pre-existing `org-telegram.port.spec.ts` `FakeTelegram.sendMessage` mismatch, which this change does not touch.
- [x] `biome check` clean on every touched file.
- [x] `bun test` for `application/connectors` + `domain/connector`: 52 pass.
- [x] Server boot (DI tokens): after adding `ConnectorEventsPort` the live `bun --watch` stand was forced to reload; `/api/health` answers 200 and `/api/events/watch` answers 401 (guard, route mounted).
- [x] No duplicated Telegram bubble: `sendMessageDraft` is a 30-second ephemeral preview limited to private chats, so streaming a draft and then sending the final text produced two bubbles until the draft expired. Draft streaming is removed: the run message is created once and edited in place, final text is the last edit.

## Live-check follow-ups

- [x] Pairing controls moved into the `Direct messages` group, where the paired chat appears.
- [x] Connector changes are pushed over SSE (`connectors-changed`): pairing, discovery, errors, pause/resume, rename, connect/disconnect arrive without pressing Refresh.
- [x] Groups and channels explain how a chat gets listed (`Add to a group`, what happens on the first message) instead of showing a bare `0`.

## Known limits

- Telegram exposes no chat list. A private group the bot joined before this connector
  existed stays invisible until it sends an update; it can be registered by id or
  renamed after discovery. `getChat` resolves names but not forum topic names, so a
  topic discovered without a title keeps its id and can be renamed manually.
