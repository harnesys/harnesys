import type { DepartmentPublic } from '@harnesys/contracts';
import { create } from 'zustand';

export interface Department {
  id: string;
  orgId: string;
  name: string;
  parentId: string | null;
  leadAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DepartmentStore {
  items: Department[];
  byId: (id: string) => Department | undefined;
  inOrg: (orgId: string) => Department[];
  upsert: (department: Department) => void;
  replaceOrg: (orgId: string, departments: Department[]) => void;
  remove: (departmentId: string) => void;
}

export function toClientDepartment(record: DepartmentPublic): Department {
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

function upsertDepartment(items: Department[], department: Department): Department[] {
  return items.some((item) => item.id === department.id)
    ? items.map((item) => (item.id === department.id ? department : item))
    : [...items, department];
}

export const useDepartmentStore = create<DepartmentStore>((set, get) => ({
  items: [],
  byId: (id) => get().items.find((item) => item.id === id),
  inOrg: (orgId) => get().items.filter((item) => item.orgId === orgId),
  upsert: (department) => {
    set((state) => ({ items: upsertDepartment(state.items, department) }));
  },
  replaceOrg: (orgId, departments) => {
    set((state) => ({
      items: [...state.items.filter((item) => item.orgId !== orgId), ...departments],
    }));
  },
  remove: (departmentId) => {
    set((state) => ({ items: state.items.filter((item) => item.id !== departmentId) }));
  },
}));
