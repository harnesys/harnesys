import type { LiveTail } from '@/entities/session';

export function liveBlockText(persisted: string, tail: LiveTail | null): string {
  if (tail?.kind !== 'text' || tail.text === '') {
    return persisted;
  }
  return tail.text.startsWith(persisted) ? tail.text : persisted;
}
