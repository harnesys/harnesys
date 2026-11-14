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
