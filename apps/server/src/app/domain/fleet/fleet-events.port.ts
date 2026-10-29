export type FleetChangedListener = (orgId: string) => void;

export abstract class FleetEventsPort {
  abstract subscribe(listener: FleetChangedListener): () => void;
  abstract emit(orgId: string): void;
}
