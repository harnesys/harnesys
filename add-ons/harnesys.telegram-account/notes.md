# Telegram account

One add-on, two surfaces on the same MTProto session: the channel feed (a trigger plus a resident poller) and a tool-pack that acts as the account.

## Setup

1. Open the add-on page and connect a **Telegram user** account under Connections. The account layer performs the phone + code login; this add-on never asks for the code.
2. The account must carry telegram-app credentials (apiId/apiHash) — the same application pair used for the session. Without them every call fails with `account_failed`.
3. For the feed, list the channels and groups in **Channels and groups** (`@username`, `t.me/...`, a private `t.me/c/<id>` link or a numeric id, one per line). For the tools, nothing else is required: `allowed_chats` empty means every chat the account can reach.

Numeric ids and `t.me/c/<id>` links are resolved through the account's own dialog list, so the account must already be a member of that chat; the resolved access hash is cached in memory so later ticks do not rescan. Invite links (`t.me/+hash`, `t.me/joinchat/...`) cannot be read without joining; the feed channel list still rejects them, but `join_chat` accepts them and joins the chat.

The feed and the tools are independent: set the channel list to use only the tools, or stay read-only to use only the feed. Nothing in the tool-pack is enabled by the feed and nothing in the feed needs the tool limits.

Permissions used by the tools: `accounts.use` and `accounts.credentials` for the session, `http.fetch` to pull media by url, `files.read` to upload workspace files and `files.write` to save downloads.

## Feed

The poller reads the newest 20 posts of every watched channel and fires the `telegram.feed` trigger for posts published after the trigger instance was created. `backfill` decides how many of the newest posts fire on the first sync; `0` keeps the history silent. `poll_sec` defaults to 120 and is clamped to 30..3600.

Stored posts and their fire counters stay inside the add-on data: they are kept for dedupe and accounting, and the settings page shows only the source list, not a post feed.

Trigger instances are bound to the add-on id. Instances created under the previous add-on id do not survive the rename: recreate them under this add-on so the poller has something to fire.

## Tools

All tools run as the connected user account over MTProto on one process-wide client, opened lazily from the bound account and reused across calls; calls are queued one at a time so parallel tool calls never race the same session. The client is rebuilt when the connected account, its session or its apiId/apiHash changes, and dropped after an `account_failed` result. There is no background polling. `chat` everywhere accepts `@username`, a `t.me/...` link (post links are trimmed to the chat), a private `t.me/c/<id>` link or a numeric peer id; a Bot API id like `-1001234567890` is accepted and mapped to the MTProto peer id. Usernames resolve directly; numeric ids and private links resolve from the account's dialogs, so the account must be a member.

| Tool | Effect | What it does |
| --- | --- | --- |
| `get_account` | read | Account id, @username, first/last name, phone when exposed |
| `list_dialogs` | read | Dialogs with kind, peerId, @username, title, unread; `limit` default 50, cap `max_dialogs`; not filtered by `allowed_chats` |
| `list_messages` | read | Chat history, newest first; `limit` default 20, cap `max_history_limit`; optional `beforeId`; text truncated to 2000 characters |
| `get_message` | read | One message: date, sender, text ±truncated, mediaKind, mediaSize, replyToMessageId, forwardFrom, views, editedAt |
| `search_messages` | read | Text search, `limit` default 20, cap `max_history_limit`; with `chat` inside that chat, without it globally with `peerId` per hit, limited by `allowed_chats` and counting dropped hits in `filteredOut` |
| `get_chat` | read | title, kind, @username, about, participantsCount, isMember, pinnedMessageId, slowmodeSeconds; unknown fields are null |
| `list_participants` | read | Members: id, @username, name, isBot, isAdmin; `limit` default 50, cap 200; `search`, `adminsOnly` |
| `list_topics` | read | Forum topics: id, title, closed, pinned, unread; `limit` default 20, cap 100 |
| `send_message` | write | Text ≤4096; `replyTo`, `parseMode` none/markdown/html, `silent`, `scheduleAt` |
| `send_media` | write | One photo/video/document/audio/voice/gif from a url or workspace path; `caption` ≤1024, `kind`, `forceDocument`, `replyTo`, `silent`, `parseMode` |
| `send_album` | write | 2–10 items in one call; per-item `source`, `kind`, `caption`; gif stays animated and voice stays a voice note; `replyTo`, `silent`, `parseMode` |
| `forward_message` | write | Forward up to 100 ids (`messageIds`, legacy `messageId`); `dropAuthor`, `silent` |
| `copy_message` | write | Forward with the author dropped, or with `caption` download and re-upload the media under the new caption (download bounded by `min(max_download_mb, max_upload_mb)`) |
| `edit_message` | write | Replace the text of an own message; `parseMode` |
| `delete_messages` | write | Delete up to 100 ids; `revoke` default true |
| `pin_message` | write | Pin one message; `notify` default false |
| `unpin_message` | write | Unpin one message, or all pinned messages when `messageId` is omitted |
| `react` | write | Set one emoji reaction; empty `emoji` clears it |
| `join_chat` | write | Join by invite link (`t.me/+hash`, `t.me/joinchat/hash`) or public `@username` |
| `leave_chat` | write | Leave a group, supergroup or channel |
| `create_topic` | write | Create a forum topic, returns its id; `title` ≤128 |
| `download_media` | write | Save the media of one message into the workspace as `path`; returns path, size, mimeType |
| `mark_read` | write | Clear the unread badge of `chat` |

`allowed_chats` is a hard grant list: a chat passes when its id **or** its @username is listed, so `@sales` also allows the numeric id of the same chat. Everything else fails with `permission_denied`, with two exceptions: `list_dialogs` is never filtered, and `join_chat` by invite link is not checked against the list (see below). The global `search_messages` (no `chat`) is the one case where the list filters instead of failing: hits from chats outside it are dropped and counted in `filteredOut`. `read_only` rejects every write tool, `download_media` included, and leaves the eight read tools working.

## Media

`send_media`, `send_album` and the caption path of `copy_message` take bytes from one of two places:

- **https url** — fetched with `ctx.http.fetch` using `responseEncoding: 'base64'`, so no temporary file is written. Redirects are not followed and only `https://` is allowed; `http://`, `file://`, `data:` and other schemes fail with `invalid_params`. The host caps an `http.fetch` response at 8 MB, so a url source is capped at `min(max_upload_mb, 8 MB)`.
- **workspace path** — relative to the organization workspace, read in 4 MB chunks with `ctx.files.read`. Absolute paths, `~`, windows drive letters and `..` segments are rejected before any file access. This path honours the full `max_upload_mb`.

The size is checked before the upload: `ctx.files.stat` for a path, the decoded byte length for a url. Bytes live in memory as one Buffer and go to Telegram through `sendFile` (`teleproto.client.uploads.CustomFile`), which infers the media type from the file name. The name is rebuilt from the source name and the resolved kind, so a `.txt` forced to `photo` is uploaded as `.jpg` rather than as a document. Voice notes pass `voiceNote: true`, gifs get `DocumentAttributeAnimated`, `forceDocument` sends photos and videos as files; albums pass the same per-item attributes, so a gif stays animated and a voice note stays a voice message.

`download_media` does the reverse: `getMessages` for the id, a size check against `max_download_mb`, `downloadMedia` into a Buffer, then `ctx.files.write` in 4 MB chunks with `append` after the first. Only media messages can be downloaded; text messages fail with `invalid_params`, and so does a file whose size Telegram already reports as above the cap.

`max_upload_mb` and `max_download_mb` default to 20 MB each and clamp to 1..50 MB. Two more limits exist inside the host and cannot be raised from here: `files.write` accepts 4 MB per call and `http.fetch` returns at most 8 MB.

Not supported in this pass: stickers (neither sending nor packs), polls, contact and location messages, round video notes, streaming video attributes (an `.mp4` is sent as a plain video), thumbnails, and editing the media of an existing message (only its text).

## Joins and leaves

`join_chat` takes an invite link or a public `@username`. Invite links are resolved by `messages.importChatInvite`, usernames by `channels.joinChannel` plus the dialog cache; `leave_chat` uses `channels.leaveChannel` for channels and supergroups and `messages.deleteChatUser` for basic groups.

Joining is a deliberate hole in the grant list: an invite link is not compared against `allowed_chats`, because a chat that is not a member yet cannot be listed there, and the point of the tool is to enter a fresh private chat. `join_allowed` (default true) is the switch for that: when it is off, both `join_chat` and `leave_chat` fail with `permission_denied`, and `read_only` blocks them as well. Reading inside the joined chat still goes through `allowed_chats`, so add the chat to the list before an agent acts on it.

## Limits and why they exist

A user account is not a bot: Telegram throttles it with `FLOOD_WAIT_*`, and repeated abuse gets the account restricted or banned. The defaults are deliberately conservative.

- `min_send_interval_ms` (2000) — gap between two sends to the same chat.
- `max_sends_per_hour` (20) — account-wide rolling hour.
- `max_sends_per_day` (150) — account-wide rolling 24 hours.
- `max_history_limit` (100) and `max_dialogs` (200) — caps for the `limit` argument, so one call cannot pull the whole account.
- `max_upload_mb` (20) and `max_download_mb` (20) — per-item media caps, clamped to 1..50.
- `flood_wait_retries` (0) — `0` fails at once with `rate_limited` and `retry_after` in the detail. `1..3` waits out a `FLOOD_WAIT` of 30 seconds or less inside the call and retries once; longer waits still fail. It wraps the actual Telegram call for text, media, album, copy, edit, delete and join alike.

Windows are enforced from the `send_log` table, not from memory, so restarts and several concurrent runs share one budget. One tool call writes one entry, never one per message: a 10-item album, a 100-id forward, a 100-id delete, an edit and a join each cost exactly one. `mark_read`, `pin_message`, `unpin_message`, `react`, `create_topic` and the read tools do not consume it.

For monitoring scenarios keep `read_only` on: reading dialogs and history has no deliverability risk, while posting from a user account is what gets accounts limited.

## Not implemented in this pass

Sticker and emoji-pack management, story posting, folders, chat and profile administration (titles, avatars, invites, bans), polls, contact and location messages, streaming uploads for large videos, schedulable media (`scheduleAt` exists for text only), editing the media of an existing message, message threads and comments, and global-search pagination beyond one page.
