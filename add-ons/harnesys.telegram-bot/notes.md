**Pairing**

1. Bind a `telegram-bot` account created from a @BotFather token in the connections section.
2. Send `/start` in a private chat with the bot — it replies with a pair code.
3. Enter the code above.

The first message after pairing connects the chat to its Harnesys thread, and agent replies come back here.

> This add-on must own its own bot token: sharing one token with the Telegram groups add-on breaks both pollers (Telegram returns `409`).
