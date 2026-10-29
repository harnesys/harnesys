export interface IssueLabelRecord {
  id: string;
  orgId: string;
  title: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssueLabelInsert {
  id: string;
  orgId: string;
  title: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export type IssueLabelPatch = Partial<{
  title: string;
  color: string;
  updatedAt: string;
}>;
