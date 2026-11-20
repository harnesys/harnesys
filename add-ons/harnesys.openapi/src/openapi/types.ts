export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ParamLocation = 'path' | 'query' | 'header';

export type CallMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface ResponseDoc {
  status: string;
  description?: string;
}

export interface NormalizedParam {
  name: string;
  in: ParamLocation;
  required: boolean;
  description?: string;
  schema?: Record<string, unknown>;
}

export interface NormalizedOperation {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary: string;
  params: NormalizedParam[];
  bodyRequired: boolean;
  bodySchema: Record<string, unknown> | null;
  multipart: boolean;
  responses: ResponseDoc[];
}

export interface ParseResult {
  baseUrlHint: string | null;
  operations: NormalizedOperation[];
  warnings: string[];
}

export interface OperationSpec {
  params: NormalizedParam[];
  bodyRequired: boolean;
  bodySchema: Record<string, unknown> | null;
  multipart?: boolean;
  responses: ResponseDoc[];
}
