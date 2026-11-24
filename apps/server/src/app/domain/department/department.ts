export interface DepartmentRecord {
  id: string;
  orgId: string;
  name: string;
  parentId: string | null;
  leadAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DepartmentPatch = Partial<{
  name: string;
  parentId: string | null;
  leadAgentId: string | null;
}>;
