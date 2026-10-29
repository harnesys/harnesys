export abstract class SourceWatchGatePort {
  abstract acquire(orgId: string): () => void;
}
