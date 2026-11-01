import type { TerminalWatchEvent } from '@harnesys/studio-shared';

export type TerminalEventListener = (orgId: string, event: TerminalWatchEvent) => void;

export abstract class TerminalEventsPort {
  abstract subscribe(listener: TerminalEventListener): () => void;
  abstract emit(orgId: string, event: TerminalWatchEvent): void;
}
