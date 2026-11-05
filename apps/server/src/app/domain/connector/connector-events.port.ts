export type ConnectorChangeListener = (orgId: string) => void;

export abstract class ConnectorEventsPort {
  abstract subscribe(listener: ConnectorChangeListener): () => void;
  abstract emit(orgId: string): void;
}
