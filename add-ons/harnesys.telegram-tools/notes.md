**Setup**

1. Install this add-on when agents should act in Telegram. The Telegram bot and Telegram groups add-ons stay responsible for long polling, pairing and routing; this one only calls the Bot API on demand.
2. Connect one or more `telegram-bot` accounts on this add-on's settings page. Reusing the same @BotFather token as a transport add-on is safe: this add-on never calls `getUpdates`, so the pollers keep working.
3. Grant the `harnesys.telegram-tools.telegram` pack to the agents that need it (Agent → Capabilities). Agents without the grant see no Telegram tools at all.

**Several bots**

- `list_bots` shows every connected bot with its account id, label, Telegram bot id, status and effective rights.
- Tools take an optional `bot` (account id, label or Telegram bot id). One bound bot needs no `bot`; with several bots the call fails with `invalid_params` until one is named.
- Per-bot rules live in the **Per-bot rules (JSON)** setting, keyed by label or account id:

```json
{
  "@sales_bot": { "allowed_chats": ["@sales", "-100123"], "read_only": false },
  "@ops_bot": { "default_chat": "@ops", "read_only": true }
}
```

A missing key falls back to the global Default chat, Allowed chats and Read-only fields, so one bot can stay read-only while another posts.

**Settings**

- **Default chat** — used when a tool call omits `chat`. Accepts `-100…`, a numeric id, `@username`, or `chatId:topicId` for a forum topic.
- **Allowed chats** — comma- or newline-separated allow-list. Empty means every chat the bot can reach. A chat matches by id or by @username, so `@channel` allows `-100…` and the other way round (the add-on resolves the target with `getChat` once and caches the identity). Any other chat fails with `permission_denied` naming the allowed entries.
- **Read-only** — blocks every tool that writes to Telegram (`send_message`, `edit_message`, `delete_message`, `send_media`, `send_album`, `forward_message`, `pin_message`, `create_topic`, `edit_topic`, `create_poll`). `get_chat`, `get_file` and `download_file` keep working.

**Behavior**

- `list_chats` returns the chats configured for this add-on (Default chat plus Allowed chats), hydrated with `getChat`: id, type, title, username. Telegram has no API to enumerate the chats a bot belongs to, so this list is the add-on allow-list, not a live chat list.
- Errors keep the Telegram status and the category: `telegram 400 not_found: Bad Request: chat not found (…)` instead of a bare description.
- `send_media` and `send_album` return `fileId`/`fileIds`, so a sent file can be reused through `get_file` or `download_file` without uploading it again.