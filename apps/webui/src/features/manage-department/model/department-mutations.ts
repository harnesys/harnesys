import { toClientAgentFromPublic, useAgentStore } from '@/entities/agent';
import { toClientDepartment, useDepartmentStore } from '@/entities/department';
import {
  createDepartmentInOrg,
  deleteDepartmentInOrg,
  updateAgentInOrg,
  updateDepartmentInOrg,
} from '@/shared/api';

export async function createDepartment(orgId: string, name: string) {
  const record = await createDepartmentInOrg(orgId, { name });
  useDepartmentStore.getState().upsert(toClientDepartment(record));
  return record;
}

export async function renameDepartment(
  orgId: string,
  departmentId: string,
  name: string,
): Promise<void> {
  const record = await updateDepartmentInOrg(orgId, departmentId, { name });
  useDepartmentStore.getState().upsert(toClientDepartment(record));
}

export async function setDepartmentLead(
  orgId: string,
  departmentId: string,
  leadAgentId: string | null,
): Promise<void> {
  const record = await updateDepartmentInOrg(orgId, departmentId, { leadAgentId });
  useDepartmentStore.getState().upsert(toClientDepartment(record));
}

export async function deleteDepartment(orgId: string, departmentId: string): Promise<void> {
  await deleteDepartmentInOrg(orgId, departmentId);
  useDepartmentStore.getState().remove(departmentId);
}

export async function moveAgentToDepartment(
  orgId: string,
  agentId: string,
  departmentId: string | null,
): Promise<void> {
  const record = await updateAgentInOrg(orgId, agentId, { departmentId });
  useAgentStore.getState().upsert(toClientAgentFromPublic(record));
}
