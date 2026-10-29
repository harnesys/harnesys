import type { CommitKind, Event, Snapshot } from '../domain/snapshot.ts';
export interface CommitMeta {
  kind: CommitKind;
  sequence: number;
}
export interface RuntimeState {
  readonly sessionId: string;
  load(): Promise<Snapshot | null> | Snapshot | null;
  commit(snapshot: Snapshot, events: readonly Event[], meta: CommitMeta): Promise<void>;
  child(spawnId: string): RuntimeState;
}
