import type {
  CreateDepartmentBody,
  DepartmentPublic,
  ListDepartmentsResponse,
  UpdateDepartmentBody,
} from '@harnesys/contracts';
import { apiJson } from './client';

export type { CreateDepartmentBody, DepartmentPublic, UpdateDepartmentBody };

function departmentsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/departments`;
}

export function fetchOrgDepartments(orgId: string) {
  return apiJson<ListDepartmentsResponse>(departmentsBase(orgId));
}

export function createDepartmentInOrg(orgId: string, body: CreateDepartmentBody) {
  return apiJson<DepartmentPublic>(departmentsBase(orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateDepartmentInOrg(
  orgId: string,
  departmentId: string,
  body: UpdateDepartmentBody,
) {
  return apiJson<DepartmentPublic>(
    `${departmentsBase(orgId)}/${encodeURIComponent(departmentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function deleteDepartmentInOrg(orgId: string, departmentId: string) {
  return apiJson<void>(`${departmentsBase(orgId)}/${encodeURIComponent(departmentId)}`, {
    method: 'DELETE',
  });
}
