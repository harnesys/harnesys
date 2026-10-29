export interface PendingInbound {
  text: string;
  attachmentIds: string[];
  messageId: string;
}

export function foldPending(items: PendingInbound[]): {
  text: string;
  attachmentIds: string[];
  clientEventId: string;
} {
  return {
    text: items
      .map((item) => item.text)
      .filter((part) => part.length > 0)
      .join('\n\n'),
    attachmentIds: items.flatMap((item) => item.attachmentIds),
    clientEventId: `telegram:${items[0]?.messageId ?? 'empty'}`,
  };
}
