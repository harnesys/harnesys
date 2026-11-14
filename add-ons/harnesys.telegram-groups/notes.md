**Setup**

1. Bind a `telegram-bot` account created from a @BotFather token in the connections section.
2. Add the bot to a group — it discovers the group once it sees any message there, or send `/start` or `/join` to register explicitly. The bot verifies that it is an admin or has privacy mode disabled.
3. Connect the group or a forum topic above with the agent that should answer.

Every message of a connected group or topic mirrors into its thread with sender attribution, and replies go back into the group. Each forum topic can have its own thread and agent.

**Responder mode**

- `auto` — the pinned agent answers every message.
- `mention` — only @mentions and replies start a run.

Unbind in the **Routing** table stops mirroring. Deleting a topic in Telegram or removing the bot marks the connection disconnected automatically.

> The bot must own its own token: sharing one token with the Telegram bot add-on breaks both pollers (Telegram returns `409`).

**Bursts and replies**

Group traffic arrives in bursts: one poll can return dozens of messages from a dozen people while the agent is still answering the previous batch. Every message of a connected group or topic therefore lands in a per-chat SQLite queue first, and the chat is flushed only when its thread has no active run (`queued`, `running`, `needs_input`, `waiting`). Nothing is dropped silently and nothing is replayed into a busy thread.

- `inbox_max_batch` (20) — messages handed to the agent in one turn.
- `inbox_max_chars` (3000) — characters of the batched text; the newest lines are kept and the rest is summarised as `[+N earlier messages omitted]`.
- `inbox_max_backlog` (50) — queued messages per chat; older ones are dropped and counted as omitted.
- `inbox_ttl_sec` (3600) — queued messages older than this are dropped at flush time instead of being replayed.
- `reply_mode` — `auto` (default) replies to the last message of the batch once, `always` replies while the anchor is fresh, `never` posts without a reply.
- `reply_window_sec` (900) — an answer older than this after the last queued message is posted without a reply, so a reply never points at a stale or foreign message.

The agent sees one attributed line per message (`From @author in Group: text`), which keeps the sender context that a single concatenated blob would lose. Attachments are stored as Telegram file references in the queue payload and re-downloaded at flush time, so a restart of the add-on does not lose media either. While a backlog exists, the poller shortens the `getUpdates` long-poll from 20 s to 3 s so a queued batch leaves as soon as the thread frees up; there is no background polling when the queue is empty.

Replies are anchored only when the answer comes from the thread bound to that chat: the transport compares `threadId` of the outgoing call with the connection row, so an answer produced in another thread is never attached to someone else's message.

**Agent tools**

Chat tools are not part of this add-on. Install the **Telegram tools** add-on, connect the bot there and grant its pack to the agents that should act through Telegram; this add-on keeps owning polling, routing and replies.
