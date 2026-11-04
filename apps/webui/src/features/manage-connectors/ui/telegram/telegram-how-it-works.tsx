export function TelegramHowItWorks() {
  return (
    <div
      className="rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground leading-relaxed"
      data-testid="telegram-how-it-works"
    >
      A bot is a transport. Add it here, then connect one of its chats (a direct message, a group,
      or a forum topic) to a thread. A thread decides which agents answer: one agent replies to
      every message, the rest answer when mentioned. Messages sent from Harnesys are not mirrored to
      Telegram.
    </div>
  );
}
