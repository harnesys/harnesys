import type { IssueLabelInsert, IssueLabelPatch, IssueLabelRecord } from './label.ts';

export abstract class IssueLabelRepositoryPort {
  abstract listByOrg(orgId: string): IssueLabelRecord[];
  abstract findById(orgId: string, id: string): IssueLabelRecord | undefined;
  abstract insert(rec: IssueLabelInsert): IssueLabelRecord;
  abstract update(orgId: string, id: string, patch: IssueLabelPatch): IssueLabelRecord;
  abstract delete(orgId: string, id: string): void;
}
