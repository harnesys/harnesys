import type { DepartmentPatch, DepartmentRecord } from './department.ts';

export abstract class DepartmentRegistryPort {
  abstract list(orgId: string): DepartmentRecord[];
  abstract findById(orgId: string, id: string): DepartmentRecord | undefined;
  abstract findByName(orgId: string, name: string): DepartmentRecord | undefined;
  abstract insert(rec: DepartmentRecord): DepartmentRecord;
  abstract update(orgId: string, id: string, patch: DepartmentPatch): DepartmentRecord;
  abstract delete(orgId: string, id: string): void;
}
