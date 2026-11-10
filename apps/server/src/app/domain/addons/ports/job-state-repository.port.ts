export interface JobStateRow {
  orgId: string;
  addonId: string;
  jobId: string;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastStatus: string | null;
  enabled: boolean;
}

export abstract class JobStateRepositoryPort {
  abstract list(orgId: string, addonId?: string): JobStateRow[];

  abstract listAll(): JobStateRow[];

  abstract find(orgId: string, addonId: string, jobId: string): JobStateRow | null;

  abstract upsert(row: JobStateRow): void;

  abstract recordRun(
    orgId: string,
    addonId: string,
    jobId: string,
    ranAt: number,
    status: string | null,
  ): void;

  abstract setEnabled(orgId: string, addonId: string, jobId: string, enabled: boolean): void;

  abstract removeAddon(orgId: string, addonId: string): void;
}
