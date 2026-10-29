export interface MaterializationChangedEvent {
  orgId: string;
  sourceId: string;
  hostId: string;
}

export type MaterializationChangedListener = (event: MaterializationChangedEvent) => void;

export abstract class MaterializationEventsPort {
  abstract subscribe(listener: MaterializationChangedListener): () => void;
  abstract emit(event: MaterializationChangedEvent): void;
}
