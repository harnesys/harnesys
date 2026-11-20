import type { AddonContext, DbRow } from '@harnesys/sdk';
import { specOfOperation } from './openapi/extract.ts';
import type { NormalizedOperation, OperationSpec } from './openapi/types.ts';
import type { OperationRow } from './types.ts';

const SPEC_MAX_BYTES = 24 * 1024;
const BATCH_LIMIT = 100;

const SELECT_OPERATIONS =
  'select id, project_id as projectId, operation_id as operationId, method, path_template as pathTemplate, summary, spec from operations';

export interface ReplaceReport {
  added: number;
  updated: number;
  removed: number;
}

export async function replaceOperations(
  ctx: AddonContext,
  projectId: string,
  operations: NormalizedOperation[],
  specSha: string,
): Promise<ReplaceReport> {
  const existing = await ctx.db.all(
    'select operation_id as operationId from operations where project_id = ?',
    [projectId],
  );
  const existingIds = new Set(existing.map((row) => String(row.operationId)));
  const incomingIds = new Set(operations.map((operation) => operation.operationId));
  const staleIds = [...existingIds].filter((staleId) => !incomingIds.has(staleId));
  const statements = [
    ...operations.map((operation) =>
      upsertStatement(projectId, operation, existingIds.has(operation.operationId)),
    ),
    ...staleIds.flatMap((staleId) => [
      {
        sql: 'delete from grants where project_id = ? and operation_id = ?',
        params: [projectId, staleId],
      },
      {
        sql: 'delete from operations where project_id = ? and operation_id = ?',
        params: [projectId, staleId],
      },
    ]),
    {
      sql: 'update projects set spec_sha = ?, updated_at = ? where id = ?',
      params: [specSha, new Date().toISOString(), projectId],
    },
  ];
  for (let index = 0; index < statements.length; index += BATCH_LIMIT) {
    await ctx.db.batch(statements.slice(index, index + BATCH_LIMIT));
  }
  return {
    added: operations.length - [...existingIds].filter((id) => incomingIds.has(id)).length,
    updated: [...existingIds].filter((id) => incomingIds.has(id)).length,
    removed: staleIds.length,
  };
}

function upsertStatement(
  projectId: string,
  operation: NormalizedOperation,
  existing: boolean,
): { sql: string; params?: (string | number | boolean | null)[] } {
  const spec = JSON.stringify(compactSpec(operation));
  if (existing) {
    return {
      sql: 'update operations set method = ?, path_template = ?, summary = ?, spec = ? where project_id = ? and operation_id = ?',
      params: [
        operation.method,
        operation.path,
        operation.summary,
        spec,
        projectId,
        operation.operationId,
      ],
    };
  }
  return {
    sql: 'insert into operations (project_id, operation_id, method, path_template, summary, spec) values (?, ?, ?, ?, ?, ?)',
    params: [
      projectId,
      operation.operationId,
      operation.method,
      operation.path,
      operation.summary,
      spec,
    ],
  };
}

function compactSpec(operation: NormalizedOperation): OperationSpec {
  const full = specOfOperation(operation, true);
  if (JSON.stringify(full).length <= SPEC_MAX_BYTES) {
    return full;
  }
  const withoutSchemas = specOfOperation(operation, false);
  if (JSON.stringify(withoutSchemas).length <= SPEC_MAX_BYTES) {
    return withoutSchemas;
  }
  return {
    params: operation.params.map((param) => ({
      name: param.name,
      in: param.in,
      required: param.required,
      schema: undefined,
    })),
    bodyRequired: operation.bodyRequired,
    bodySchema: null,
    responses: [],
  };
}

export async function listOperations(
  ctx: AddonContext,
  projectId?: string,
): Promise<OperationRow[]> {
  const sql =
    projectId === undefined
      ? `${SELECT_OPERATIONS} order by project_id, path_template, method`
      : `${SELECT_OPERATIONS} where project_id = ? order by path_template, method`;
  const rows = await ctx.db.all(sql, projectId === undefined ? [] : [projectId]);
  return rows.map(mapOperation);
}

export async function getOperation(
  ctx: AddonContext,
  projectId: string,
  operationId: string,
): Promise<OperationRow | null> {
  const row = await ctx.db.get(`${SELECT_OPERATIONS} where project_id = ? and operation_id = ?`, [
    projectId,
    operationId,
  ]);
  return row === null ? null : mapOperation(row);
}

function mapOperation(row: DbRow): OperationRow {
  return {
    id: Number(row.id ?? 0),
    projectId: String(row.projectId ?? ''),
    operationId: String(row.operationId ?? ''),
    method: String(row.method ?? 'GET'),
    pathTemplate: String(row.pathTemplate ?? ''),
    summary: String(row.summary ?? ''),
    spec: JSON.parse(String(row.spec ?? '{}')) as OperationSpec,
  };
}
