import type { AddonContext, ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { executeCall, requireAgent } from './call.ts';
import type { OperationSpec } from './openapi/types.ts';
import { getProject } from './store.ts';
import { grantedOperationIds, hasGrant, listGrantedOperations } from './store-grants.ts';
import { getOperation } from './store-operations.ts';
import type { OperationRow, ProjectRow } from './types.ts';

const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;
const DETAIL_LIMIT = 40;

export const apiList: ToolHandler = async (input, ctx) => {
  const agentId = requireAgent(ctx);
  const projectFilter = optionalText(input, 'project');
  const limit = optionalLimit(input.limit, LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
  const granted = await listGrantedOperations(ctx, agentId);
  const rows = granted
    .filter((row) => matchesFilter(row.projectName, row.projectId, projectFilter))
    .slice(0, limit)
    .map((row) => ({
      project: row.projectName,
      operation: row.operationId,
      method: row.method,
      path: row.pathTemplate,
      summary: row.summary,
    }));
  return {
    projects: [...new Set(granted.map((row) => row.projectName))],
    total: granted.length,
    operations: rows,
  };
};

export const apiDocs: ToolHandler = async (input, ctx) => {
  const agentId = requireAgent(ctx);
  const { project, operation } = await resolveGranted(ctx, agentId, input);
  return {
    project: project.name,
    operation: operation.operationId,
    method: operation.method,
    path: operation.pathTemplate,
    summary: operation.summary,
    auth: authNoteOf(project),
    params: operation.spec.params,
    body: docsBodyOf(operation.spec),
    responses: operation.spec.responses,
  };
};

export const apiCall: ToolHandler = async (input, ctx) => {
  const agentId = requireAgent(ctx);
  const { project, operation } = await resolveGranted(ctx, agentId, input);
  return executeCall(ctx, project, operation, operation.spec, input);
};

async function resolveGranted(
  ctx: AddonContext,
  agentId: string,
  input: Record<string, unknown>,
): Promise<{ project: ProjectRow; operation: OperationRow }> {
  const project = await requireProject(ctx, input);
  const operation = await requireOperation(ctx, project, input);
  await assertGrant(ctx, agentId, project, operation);
  return { project, operation };
}

function matchesFilter(
  projectName: string,
  projectId: string,
  filter: string | undefined,
): boolean {
  return filter === undefined || projectName === filter || projectId === filter;
}

async function requireProject(
  ctx: AddonContext,
  input: Record<string, unknown>,
): Promise<ProjectRow> {
  const key = requiredText(input, 'project');
  const rows = await ctx.db.all('select id from projects where id = ? or name = ?', [key, key]);
  const id = rows[0]?.id;
  const project = typeof id === 'string' ? await getProject(ctx, id) : null;
  if (project === null) {
    throw new AddonError('not_found', {
      detail: `project '${key}' does not exist; check api_list`,
    });
  }
  return project;
}

async function requireOperation(
  ctx: AddonContext,
  project: ProjectRow,
  input: Record<string, unknown>,
): Promise<OperationRow> {
  const operationId = requiredText(input, 'operation');
  const operation = await getOperation(ctx, project.id, operationId);
  if (operation === null) {
    throw new AddonError('not_found', {
      detail: `operation '${operationId}' is not imported for project '${project.name}'; check api_list`,
    });
  }
  return operation;
}

async function assertGrant(
  ctx: AddonContext,
  agentId: string,
  project: ProjectRow,
  operation: OperationRow,
): Promise<void> {
  if (await hasGrant(ctx, agentId, project.id, operation.operationId)) {
    return;
  }
  const allowed = await grantedOperationIds(ctx, agentId);
  const preview = [...allowed].slice(0, DETAIL_LIMIT).join(', ');
  throw new AddonError('permission_denied', {
    detail:
      allowed.size === 0
        ? `no operations are granted to agent ${agentId}; ask an admin to grant access on the addon page`
        : `operation '${operation.operationId}' on project '${project.name}' is not granted to agent ${agentId}; granted: ${preview}`,
  });
}

function requiredText(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

function optionalText(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalLimit(raw: unknown, fallback: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.floor(raw)));
}

function docsBodyOf(spec: OperationSpec): unknown {
  if (spec.multipart === true) {
    return {
      kind: 'multipart',
      required: spec.bodyRequired,
      howTo:
        'pass files via the files parameter of api_post: [{name, path}] where path is an absolute host path (e.g. "/Users/me/pics/photo.jpg" — any file the host can read, including thread and issue attachments) or a thread file like "thread:sandbox/photo.jpg"; simple form fields go in body as a flat object',
    };
  }
  return spec.bodySchema === null ? null : { required: spec.bodyRequired, schema: spec.bodySchema };
}

function authNoteOf(project: ProjectRow): string {
  const place =
    project.authKind === 'header' || project.authKind === 'query'
      ? ` into the '${project.authParam ?? ''}' ${project.authKind} parameter`
      : '';
  if (project.authKind === 'none') {
    return 'no authentication is required';
  }
  return `credentials configured by the administrator are injected automatically${place}; never supply auth parameters yourself`;
}
