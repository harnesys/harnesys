# Telegram content tools

Agents with the `telegram` capability can run a channel or group as the connected bot. The tools live
in `packages/harnesys/src/packs/telegram` and call `TelegramChatsPort`; the server implementation is
`OrgTelegramPort` plus `TelegramApiAdapter`.

## Tool set

| Tool | What it does |
| --- | --- |
| `telegram_list_chats` | List DMs, groups, topics, and channels the bots know |
| `telegram_get_chat` | Read one chat: type, title, thread, agents |
| `telegram_read_messages` | Read recent messages the bot received (newest first) |
| `telegram_send_message` | Post text with HTML/MarkdownV2, silent/protected flags, link preview control, reply target |
| `telegram_edit_message` | Edit text and formatting of a bot message |
| `telegram_send_photo` | Post a photo with caption |
| `telegram_send_document` | Post any file with caption |
| `telegram_send_video` | Post a video with caption |
| `telegram_send_animation` | Post a GIF or silent clip |
| `telegram_send_audio` | Post an audio track |
| `telegram_send_voice` | Post a voice note |
| `telegram_send_album` | Post an album of 2–10 photos, videos, or documents with per-item captions |
| `telegram_edit_caption` | Edit a media caption |
| `telegram_delete_message` | Delete a message |
| `telegram_pin_message` | Pin a message |
| `telegram_unpin_message` | Unpin a message |
| `telegram_forward_message` | Forward a message to another chat |
| `telegram_create_topic` | Create a forum topic |
| `telegram_edit_topic` | Rename, close, or reopen a forum topic |
| `telegram_delete_topic` | Delete a forum topic and its messages |
| `telegram_send_poll` | Post a poll or quiz |

## Media input

Each media tool accepts one of:

- `filePath` — absolute path on the server, a relative path under the agent workspace, or a
  `thread:attachments/...` locator;
- `fileId` — a Telegram `file_id` the bot has already seen;
- `bytes` — base64 file content.

Local paths go through `resolveFileTarget` and the tool gate, so the agent file access policy applies.
Telegram limits captions to 1024 characters and albums to 2–10 items; both are validated before the
call.

## Limits

- Telegram Bot API has no chat history endpoint. `telegram_read_messages` only returns messages the
  bot received and that are stored in the inbox.
- Scheduled posts are not part of the Bot API. Use the Harnesys scheduler to trigger a thread that
  calls the send tools.
- Editing and deleting only work on messages the bot is allowed to change.
- The bot must be an administrator with the matching rights in a channel before posting, pinning, or
  managing topics.
