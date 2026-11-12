export interface RunSummaryRecord {
  runId: string;
  status: string;
  createdAt: string;
  agentId: string | null;
}

export interface RunListFilter {
  status?: string;
}

export abstract class RunLifecycleReaderPort {
  abstract listByThread(
    orgId: string,
    threadId: string,
    filter?: RunListFilter,
  ): Promise<RunSummaryRecord[]>;
}
