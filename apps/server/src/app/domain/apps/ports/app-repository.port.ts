import type { AppRecord, AppUpdatePatch } from '../records.ts';

export abstract class AppRepositoryPort {
  abstract list(orgId: string): AppRecord[];
  abstract listByKind(orgId: string, kind: string): AppRecord[];
  abstract findById(orgId: string, appId: string): AppRecord | null;
  abstract insert(record: AppRecord): void;
  abstract update(orgId: string, appId: string, patch: AppUpdatePatch): AppRecord;
  abstract remove(orgId: string, appId: string): void;
}
