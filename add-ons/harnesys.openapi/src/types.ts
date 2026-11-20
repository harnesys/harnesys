import type { OperationSpec } from './openapi/types.ts';

export type AuthKind = 'none' | 'bearer' | 'basic' | 'header' | 'query';

export interface ProjectRecord {
  id: string;
  name: string;
  baseUrl: string;
  authKind: AuthKind;
  authParam: string | null;
}

export interface ProjectRow extends ProjectRecord {
  specSha: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationRow {
  id: number;
  projectId: string;
  operationId: string;
  method: string;
  pathTemplate: string;
  summary: string;
  spec: OperationSpec;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string | null;
  bodyBase64?: string;
}
