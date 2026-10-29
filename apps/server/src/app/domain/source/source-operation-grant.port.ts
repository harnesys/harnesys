export interface SourceOperationGrantRecord {
  operationId: string;
  orgId: string;
  nodeId: string;
  sourceId: string;
  credRef: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface CreateSourceOperationGrantInput {
  operationId: string;
  orgId: string;
  nodeId: string;
  sourceId: string;
  credRef: string;
  expiresAt: string;
}

export abstract class SourceOperationGrantPort {
  abstract create(input: CreateSourceOperationGrantInput): void;
  abstract consume(
    orgId: string,
    operationId: string,
    nodeId: string,
  ): SourceOperationGrantRecord | null;
}
