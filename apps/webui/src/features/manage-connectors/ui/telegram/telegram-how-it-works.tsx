export function TelegramHowItWorks() {
  return (
    <div
      className="rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground leading-relaxed"
      data-testid="telegram-how-it-works"
    >
      A bot is a transport. Add it here, then connect each chat it can see to a thread: a direct
      message, a group, a forum topic, or a channel. A thread decides who answers: one agent can
      answer every message, the rest answer when mentioned. Channel posts only trigger agents when
      mentioned, and agents can post, edit, pin, and read recent messages in connected chats with
      the Telegram tool pack.
    </div>
  );
}
