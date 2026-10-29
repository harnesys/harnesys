type Listener = (threadId: string, messageId: string) => void;
const listeners = new Set<Listener>();
export function requestRevealMessage(threadId: string, messageId: string): void {
  for (const listener of listeners) {
    listener(threadId, messageId);
  }
}
export function onRevealMessageRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
type EndListener = (threadId: string) => void;
const endListeners = new Set<EndListener>();
export function requestScrollToEnd(threadId: string): void {
  for (const listener of endListeners) {
    listener(threadId);
  }
}
export function onScrollToEndRequest(listener: EndListener): () => void {
  endListeners.add(listener);
  return () => {
    endListeners.delete(listener);
  };
}
