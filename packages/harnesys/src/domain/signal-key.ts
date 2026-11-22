export interface SignalKey {
  kind: string;
  id: string;
}
export function parseSignalKey(key: string): SignalKey | null {
  const sep = key.indexOf(':');
  if (sep <= 0 || sep === key.length - 1) {
    return null;
  }
  return { kind: key.slice(0, sep), id: key.slice(sep + 1) };
}
