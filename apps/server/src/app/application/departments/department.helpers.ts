import type { DepartmentPublic } from '@harnesys/contracts';
import {
  DepartmentNotFoundException,
  DepartmentValidationException,
} from '../../domain/department/department.error.ts';
import type { DepartmentRecord } from '../../domain/department/department.ts';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';

export function toDepartmentPublic(record: DepartmentRecord): DepartmentPublic {
  return {
    id: record.id,
    orgId: record.orgId,
    name: record.name,
    parentId: record.parentId,
    leadAgentId: record.leadAgentId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function requireDepartment(
  departments: DepartmentRegistryPort,
  orgId: string,
  departmentId: string,
): DepartmentRecord {
  const found = departments.findById(orgId, departmentId);
  if (!found) {
    throw new DepartmentNotFoundException(departmentId);
  }
  return found;
}

export function assertNonEmptyDepartmentName(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new DepartmentValidationException('department name is required');
  }
  return trimmed;
}
