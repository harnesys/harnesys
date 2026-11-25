type JumpListener = (threadId: string, threadSeq: number) => void;

const listeners = new Set<JumpListener>();

export function requestMessageJump(threadId: string, threadSeq: number): void {
  for (const listener of listeners) {
    listener(threadId, threadSeq);
  }
}

export function onMessageJumpRequest(listener: JumpListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
