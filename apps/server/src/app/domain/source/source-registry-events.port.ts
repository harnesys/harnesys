export interface SourceRegistryChangedEvent {
  orgId: string;
  sourceId: string;
}

export type SourceRegistryChangedListener = (event: SourceRegistryChangedEvent) => void;

export abstract class SourceRegistryEventsPort {
  abstract subscribe(listener: SourceRegistryChangedListener): () => void;
  abstract emit(event: SourceRegistryChangedEvent): void;
}
