import type { DeskEvent } from '@harnesys/studio-shared';

export type DeskEventListener = (orgId: string, event: DeskEvent) => void;

export abstract class DeskEventsPort {
  abstract subscribe(listener: DeskEventListener): () => void;
  abstract emit(orgId: string, event: DeskEvent): void;
}
