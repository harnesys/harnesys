# Telegram account

One add-on, two surfaces on the same MTProto session: the channel feed (a trigger plus a resident poller) and a tool-pack that acts as the account.

## Setup

1. Open the add-on page and connect a **Telegram user** account under Connections. The account layer performs the phone + code login; this add-on never asks for the code.
2. The account must carry telegram-app credentials (apiId/apiHash) — the same application pair used for the session. Without them every call fails with `account_failed`.
3. For the feed, list the channels and groups in **Channels and groups** (`@username`, `t.me/...`, a private `t.me/c/<id>` link or a numeric id, one per line). For the tools, nothing else is required: `allowed_chats` empty means every chat the account can reach.

Numeric ids and `t.me/c/<id>` links are resolved through the account's own dialog list, so the account must already be a member of that chat; the resolved access hash is cached in memory so later ticks do not rescan. Invite links (`t.me/+hash`, `t.me/joinchat/...`) cannot be read without joining, so they are rejected and skipped in the feed channel list.

The feed and the tools are independent: set the channel list to use only the tools, or stay read-only to use only the feed. Nothing in the tool-pack is enabled by the feed and nothing in the feed needs the tool limits.

## Feed

The poller reads the newest 20 posts of every watched channel and fires the `telegram.feed` trigger for posts published after the trigger instance was created. `backfill` decides how many of the newest posts fire on the first sync; `0` keeps the history silent. `poll_sec` defaults to 120 and is clamped to 30..3600.

Stored posts and their fire counters stay inside the add-on data: they are kept for dedupe and accounting, and the settings page shows only the source list, not a post feed.

Trigger instances are bound to the add-on id. Instances created under the previous add-on id do not survive the rename: recreate them under this add-on so the poller has something to fire.

## Tools

All tools run as the connected user account over MTProto on one process-wide client, opened lazily from the bound account and reused across calls; calls are queued one at a time so parallel tool calls never race the same session. The client is rebuilt when the connected account, its session or its apiId/apiHash changes, and dropped after an `account_failed` result. There is no background polling. `chat` everywhere accepts `@username`, a `t.me/...` link (post links are trimmed to the chat), a private `t.me/c/<id>` link or a numeric peer id; a Bot API id like `-1001234567890` is accepted and mapped to the MTProto peer id. Usernames resolve directly; numeric ids and private links resolve from the account's dialogs, so the account must be a member.

| Tool | Effect | What it does |
| --- | --- | --- |
| `get_account` | read | Account id, @username, first/last name, phone when exposed |
| `list_dialogs` | read | Dialogs with kind, peerId, @username, title, unread; `limit` default 50, cap `max_dialogs` |
| `list_messages` | read | Chat history, newest first; `limit` default 20, cap `max_history_limit`; optional `beforeId`; text truncated to 2000 characters |
| `send_message` | write | Plain-text message up to 4096 characters to `chat`; returns `messageId` |
| `forward_message` | write | Forward one `messageId` from `fromChat` to `toChat`, both checked against `allowed_chats` |
| `mark_read` | write | Clear the unread badge of `chat` |

`allowed_chats` is a hard grant list: a chat passes when its id **or** its @username is listed, so `@sales` also allows the numeric id of the same chat. Everything else fails with `permission_denied`. `read_only` rejects the three write tools and leaves the read tools working.

## Limits and why they exist

A user account is not a bot: Telegram throttles it with `FLOOD_WAIT_*`, and repeated abuse gets the account restricted or banned. The defaults are deliberately conservative.

- `min_send_interval_ms` (2000) — gap between two sends to the same chat.
- `max_sends_per_hour` (20) — account-wide rolling hour.
- `max_sends_per_day` (150) — account-wide rolling 24 hours.
- `max_history_limit` (100) and `max_dialogs` (200) — caps for the `limit` argument, so one call cannot pull the whole account.
- `flood_wait_retries` (0) — `0` fails at once with `rate_limited` and `retry_after` in the detail. `1..3` waits out a `FLOOD_WAIT` of 30 seconds or less inside the call and retries once; longer waits still fail.

Windows are enforced from the `send_log` table, not from memory, so restarts and several concurrent runs share one budget. Only `send_message` and `forward_message` consume it; `mark_read` does not.

For monitoring scenarios keep `read_only` on: reading dialogs and history has no deliverability risk, while posting from a user account is what gets accounts limited.

## Not implemented in this pass

Media sending, joins/leaves, reactions, edits, deletes, contact and profile management are out of scope. They need their own upload path (media is not a text argument), extra flood-wait handling for file parts, and a separate review of what a connected account is allowed to change.