export abstract class WorkerOrgOperationReceiptPort {
  abstract find(orgId: string, runId: string, operationId: string): unknown | null;
  abstract save(orgId: string, runId: string, operationId: string, result: unknown): void;
}
